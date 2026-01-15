import { randomUUID } from "crypto";
import type {
  BalanceEvent,
  BotCommand,
  BotConfig,
  BotState,
  Intent,
  FillEvent,
  NormalizedEvent,
  OrderEvent,
  PerpsMarketEvent,
  PriceEvent,
  RedisEnvelope,
  WalletTxEvent
} from "@zero/core";
import { CACHE_KEYS, CHANNELS } from "@zero/core";
import { DriftPerpsConnector, JupiterLimitOrderConnector, getTokenByMint } from "@zero/connectors";
import type { Strategy } from "@zero/strategies";
import type { BotRunnerConfig } from "./config";
import { BotManager } from "./botManager";
import { ExecutionEngine } from "./executionEngine";
import { IntentEngine } from "./intentEngine";
import { MarketStateStore } from "./marketState";
import { NoopConnector } from "./noopConnector";
import { DEFAULT_PERPS_RISK_CONFIG, PerpsRiskGovernor } from "./perpsRiskGovernor";
import { Persistence } from "./persistence";
import { RedisBus } from "./redisBus";
import { RiskGovernor } from "./riskGovernor";
import { isScheduleActive } from "./schedule";
import { SimulatedConnector } from "./simulatedConnector";
import { buildStrategyRegistry } from "./strategyRegistry";

export class BotRunnerService {
  private bus: RedisBus;
  private bots = new BotManager();
  private market = new MarketStateStore();
  private intents = new IntentEngine();
  private spotRisk = new RiskGovernor();
  private perpsRisk = new PerpsRiskGovernor();
  private perpsRiskConfig = DEFAULT_PERPS_RISK_CONFIG;
  private spotExecution: ExecutionEngine;
  private noopExecution: ExecutionEngine;
  private simulatedExecution: ExecutionEngine;
  private strategies = buildStrategyRegistry();
  private spotConnector: JupiterLimitOrderConnector | NoopConnector | SimulatedConnector;
  private perpsExecutions = new Map<string, ExecutionEngine>();
  private perpsConnectors = new Map<string, DriftPerpsConnector>();
  private noopConnector = new NoopConnector();
  private simulatedConnector = new SimulatedConnector();
  private persistence: Persistence;
  private lastMarketEventAt = Date.now();
  private lastSnapshotAt = new Map<string, number>();
  private walletTxQueue = Promise.resolve();
  private processedTxs = new Set<string>();
  private evaluatingBots = new Set<string>();
  private heartbeatTimer?: NodeJS.Timeout;
  private scheduleTimer?: NodeJS.Timeout;
  private reconcileTimer?: NodeJS.Timeout;
  private accountSnapshotTimer?: NodeJS.Timeout;
  private perpsRiskTimer?: NodeJS.Timeout;
  private walletBalances = new Map<string, { balance: string; updatedAt: string }>();
  private lastAccountSnapshotAt = 0;
  private lastFillReconcileAt = new Map<string, number>();

  constructor(private config: BotRunnerConfig) {
    this.bus = new RedisBus(config.redisUrl);
    if (!config.executionEnabled || config.executionMode === "disabled") {
      this.spotConnector = this.noopConnector;
    } else if (config.executionMode === "simulated") {
      this.spotConnector = this.simulatedConnector;
    } else {
      this.spotConnector = new JupiterLimitOrderConnector({
        rpcUrl: config.solanaRpcUrl,
        privateKey: config.solanaPrivateKey,
        cluster: config.solanaCluster,
        apiUrl: config.jupiterTriggerApiUrl,
        apiKey: config.jupiterApiKey,
        computeUnitPrice: config.jupiterComputeUnitPrice,
        apiRps: config.jupiterApiRps,
        minOrderUsd: config.jupiterMinOrderUsd
      });
    }
    this.spotExecution = new ExecutionEngine(this.spotConnector);
    this.noopExecution = new ExecutionEngine(this.noopConnector);
    this.simulatedExecution = new ExecutionEngine(this.simulatedConnector);
    this.persistence = new Persistence(config.databaseUrl, config.persistenceEnabled);
  }

  async start() {
    this.bus.onPattern("cmd:bot:*", (channel, message) => this.handleCommand(channel, message));
    this.bus.onPattern("md:price:*", (channel, message) => this.handleMarketEvent(channel, message));
    this.bus.onPattern("md:perps:*", (channel, message) => this.handleMarketEvent(channel, message));
    if (this.config.walletPubkey) {
      this.bus.onPattern(CHANNELS.walletBalances(this.config.walletPubkey), (channel, message) =>
        this.handleWalletBalance(channel, message)
      );
      this.bus.onPattern(CHANNELS.walletTx(this.config.walletPubkey), (channel, message) =>
        this.handleWalletTx(channel, message)
      );
    }

    await this.loadBots();
    await this.loadPerpsRiskConfig();

    this.heartbeatTimer = setInterval(() => {
      void this.checkHealth();
    }, this.config.heartbeatIntervalMs);
    this.scheduleTimer = setInterval(() => {
      void this.refreshSchedules();
    }, 30000);
    this.reconcileTimer = setInterval(() => {
      void this.reconcileBots();
    }, this.config.reconcileIntervalMs);
    if (this.config.walletPubkey) {
      this.accountSnapshotTimer = setInterval(() => {
        void this.maybeAccountSnapshot();
      }, this.config.accountSnapshotIntervalMs);
    }
    this.perpsRiskTimer = setInterval(() => {
      void this.loadPerpsRiskConfig();
    }, 60000);
    await this.checkHealth();
  }

  async stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
    }
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
    }
    if (this.accountSnapshotTimer) {
      clearInterval(this.accountSnapshotTimer);
    }
    if (this.perpsRiskTimer) {
      clearInterval(this.perpsRiskTimer);
    }
    await this.persistence.close();
    await this.bus.close();
  }

  private handleCommand(_channel: string, message: string) {
    const command = parseCommand(message);
    if (!command) {
      return;
    }

    const result = this.bots.handleCommand(command);
    void this.bus.publishBotEvent(result.event);
    void this.persistence.logEvent(result.event);

    const state = result.state;
    const config = this.bots.getConfig(command.botId);

    if (command.action === "stop" && config && this.config.executionEnabled) {
      void this.cancelOpenOrders(command.botId, config, state.runId, "stop");
    }

    if (command.action === "update_config" && command.payload?.cancelOpenOrders && config && this.config.executionEnabled) {
      void this.cancelOpenOrders(command.botId, config, state.runId, "config_update");
    }

    if ((command.action === "start" || command.action === "resume") && config) {
      void this.persistence
        .startBotRun(command.botId, config, config.strategyKey)
        .then((runId) => {
          const updated = this.bots.setRunId(command.botId, runId);
          void this.bus.setCache(CACHE_KEYS.bot(command.botId), updated);
          void this.persistence.saveBotSnapshot(updated);
        });
    } else if (command.action === "stop" && state.runId) {
      void this.persistence.endBotRun(state.runId, "stopped").then(() => {
        const updated = this.bots.setRunId(command.botId, undefined);
        void this.bus.setCache(CACHE_KEYS.bot(command.botId), updated);
        void this.persistence.saveBotSnapshot(updated);
      });
    } else {
      void this.bus.setCache(CACHE_KEYS.bot(command.botId), state);
      void this.persistence.saveBotSnapshot(state);
    }

    if (["start", "resume", "pause", "stop"].includes(command.action)) {
      void this.persistence.updateBotStatus(command.botId, state.status);
    }

    void this.applySchedule(command.botId);
  }

  private async loadBots() {
    const bots = await this.persistence.listBots();
    for (const bot of bots) {
      const state = this.bots.setConfig(
        bot.id,
        bot.config as unknown as BotConfig,
        bot.status as BotState["status"]
      );
      await this.bus.setCache(CACHE_KEYS.bot(bot.id), state);
    }
    await this.refreshSchedules();
  }

  private handleMarketEvent(_channel: string, message: string) {
    const envelope = parseEnvelope(message);
    if (!envelope) {
      return;
    }

    if (envelope.kind === "price") {
      const event = envelope.data as PriceEvent;
      this.lastMarketEventAt = Date.now();
      this.market.applyPrice(event);
      const updated = this.bots.updatePriceForSymbol(event.symbol, event.price, event.ts);
      for (const state of updated) {
        void this.bus.setCache(CACHE_KEYS.bot(state.botId), state);
        this.maybeSnapshot(state);
        void this.maybeAccountSnapshot();
        void this.evaluateBot(state.botId);
        if (this.config.executionMode === "simulated") {
          void this.simulateFills(state.botId, event.price);
        }
      }
      return;
    }

    if (envelope.kind === "perps_market") {
      const event = envelope.data as PerpsMarketEvent;
      this.lastMarketEventAt = Date.now();
      this.market.applyPerpsMarket(event);
      const updated = this.bots.updatePriceForSymbol(event.market, event.markPrice, event.ts);
      for (const state of updated) {
        void this.bus.setCache(CACHE_KEYS.bot(state.botId), state);
        this.maybeSnapshot(state);
        void this.evaluateBot(state.botId);
      }
    }
  }

  private handleWalletBalance(_channel: string, message: string) {
    const envelope = parseEnvelope(message);
    if (!envelope || envelope.kind !== "balance") {
      return;
    }
    const event = envelope.data as BalanceEvent;
    this.walletBalances.set(event.tokenMint, { balance: event.balance, updatedAt: event.ts });
    void this.maybeAccountSnapshot();
  }

  private handleWalletTx(_channel: string, message: string) {
    const envelope = parseEnvelope(message);
    if (!envelope || envelope.kind !== "wallet_tx") {
      return;
    }
    const event = envelope.data as WalletTxEvent;
    if (!event.signature || event.status === "failed") {
      return;
    }
    if (this.processedTxs.has(event.signature)) {
      return;
    }
    this.processedTxs.add(event.signature);
    if (this.processedTxs.size > 500) {
      const first = this.processedTxs.values().next().value;
      if (first) {
        this.processedTxs.delete(first);
      }
    }

    this.walletTxQueue = this.walletTxQueue
      .then(() => this.processFillFromTx(event))
      .catch((err) => console.warn("[bot-runner] wallet tx processing failed", err));
  }

  private async evaluateBot(botId: string) {
    if (this.evaluatingBots.has(botId)) {
      return;
    }
    this.evaluatingBots.add(botId);
    try {
    const state = this.bots.getState(botId);
    const config = this.bots.getConfig(botId);
    if (!state || !config || state.status !== "running") {
      return;
    }
    const scheduleActive = isScheduleActive(config);
    const scheduleState = this.bots.updateScheduleActive(botId, scheduleActive);
    await this.bus.setCache(CACHE_KEYS.bot(botId), scheduleState);
    if (!scheduleActive) {
      return;
    }

    const symbol = resolveMarketSymbol(config);
    if (!symbol) {
      return;
    }
    const market = this.market.get(symbol);
    if (!market) {
      return;
    }
    const strategy = this.getStrategy(config);
    if (!strategy) {
      return;
    }

    if (!isPerpsBot(config)) {
      this.ensureSpotStartState(botId, config, market.lastPrice);
      await this.reconcileSpotFills(botId, config);
    }

    const openOrders = await this.persistence.listOpenOrders(botId);
    const strategyOrders: StrategyOrder[] = openOrders.map((order) => ({
      id: order.id,
      externalId: order.externalId ?? undefined,
      side: order.side as "buy" | "sell",
      price: order.price.toString(),
      size: order.size.toString(),
      status: order.status as "new" | "open" | "partial" | "filled" | "canceled" | "rejected"
    }));
    if (!isPerpsBot(config)) {
      const venueOrders = await this.fetchVenueOpenOrders(botId, config);
      if (!venueOrders) {
        return;
      }
      if (config.grid?.gridCount && venueOrders.length >= config.grid.gridCount) {
        console.warn("[bot-runner] skipping placement: venue open orders exceed grid count", {
          botId,
          market: config.market,
          openOnVenue: venueOrders.length,
          gridCount: config.grid.gridCount
        });
        return;
      }
      const venueStrategyOrders = venueOrders.map((order) => ({
        id: order.externalId ?? order.orderId ?? randomUUID(),
        externalId: order.externalId ?? order.orderId ?? undefined,
        side: order.side,
        price: order.price ?? "0",
        size: order.size ?? "0",
        status: (order.status ?? "open") as StrategyOrder["status"]
      }));
      strategyOrders.splice(0, strategyOrders.length, ...mergeStrategyOrders(strategyOrders, venueStrategyOrders));
    }
    const intents = await this.intents.run(strategy, {
      botConfig: config,
      botState: state,
      market,
      openOrders: strategyOrders
    });

    const spotFiltered = !isPerpsBot(config)
      ? filterSpotIntents(intents, config, this.walletBalances)
      : intents;
    const decision = isPerpsBot(config)
      ? this.perpsRisk.evaluate(state.risk, spotFiltered, botId, market, this.perpsRiskConfig)
      : this.spotRisk.evaluate(state.risk, spotFiltered, botId);
    const updatedState = this.bots.updateRisk(botId, decision.riskState);
    await this.bus.setCache(CACHE_KEYS.bot(botId), updatedState);

    if (decision.riskEvent) {
      await this.bus.publishBotEvent(decision.riskEvent);
      await this.persistence.logEvent(decision.riskEvent);
      return;
    }

    if (!this.config.executionEnabled || decision.allowedIntents.length === 0) {
      return;
    }

    const execution = await this.getExecutionEngine(botId, config).then((engine) =>
      engine.execute(botId, decision.allowedIntents)
    );
    for (const event of execution.events) {
      if (event.botId) {
        await this.bus.publishBotEvent(event);
        await this.persistence.logEvent(event, { market: config.market, runId: state.runId });
      }
    }
    } finally {
      this.evaluatingBots.delete(botId);
    }
  }

  private getStrategy(config: BotConfig): Strategy | undefined {
    return this.strategies.get(config.strategyKey);
  }

  private async refreshSchedules() {
    for (const botId of this.bots.listBotIds()) {
      await this.applySchedule(botId);
    }
  }

  private async applySchedule(botId: string) {
    const config = this.bots.getConfig(botId);
    if (!config || !config.schedule) {
      return;
    }
    const active = isScheduleActive(config);
    const state = this.bots.updateScheduleActive(botId, active);
    await this.bus.setCache(CACHE_KEYS.bot(botId), state);
  }

  private async reconcileBots() {
    if (!this.config.executionEnabled) {
      return;
    }
    for (const botId of this.bots.listBotIds()) {
      const state = this.bots.getState(botId);
      const config = this.bots.getConfig(botId);
      if (!state || !config) {
        continue;
      }
      if (state.status !== "running" || state.scheduleActive === false) {
        continue;
      }
      try {
        const connector = await this.getConnector(botId, config);
        await connector.reconcile(config.market);
      } catch (err) {
        console.warn("[bot-runner] reconcile failed", { botId, error: (err as Error).message });
      }
    }
  }

  private async cancelOpenOrders(botId: string, config: BotConfig, runId: string | undefined, reason: string) {
    try {
      const connector = await this.getConnector(botId, config);
      const before = await connector.getOpenOrders(config.market);
      console.info("[bot-runner] cancel all preflight", { botId, market: config.market, openOnVenue: before.length });
      const intent = {
        id: randomUUID(),
        botId,
        kind: "cancel_all" as const,
        createdAt: new Date().toISOString(),
        symbol: config.market,
        reason
      };
      const result = await connector.cancelAll(intent);
      if (!result.ok) {
        console.warn("[bot-runner] cancel all failed", { botId, error: result.error });
        return;
      }
      const canceledCount = result.meta?.canceled ?? 0;
      if (canceledCount === 0) {
        console.warn("[bot-runner] cancel all returned zero orders", { botId, market: config.market });
        return;
      }
      const after = await connector.getOpenOrders(config.market);
      console.info("[bot-runner] cancel all postflight", { botId, market: config.market, openOnVenue: after.length });
      await this.syncOpenOrders(botId, config.market, runId, "stop_cancel");
    } catch (err) {
      console.warn("[bot-runner] cancel all error", { botId, error: (err as Error).message });
    }
  }

  private async syncOpenOrders(botId: string, market: string, runId: string | undefined, reason: string) {
    try {
      const config = this.bots.getConfig(botId);
      if (!config) {
        return;
      }
      const connector = await this.getConnector(botId, config);
      const venueOpen = await connector.getOpenOrders(market);
      const openIds = new Set(venueOpen.map((order) => order.externalId ?? order.orderId));
      const dbOpen = await this.persistence.listOpenOrders(botId);
      let canceled = 0;
      for (const order of dbOpen) {
        if (!order.externalId) {
          continue;
        }
        if (!openIds.has(order.externalId)) {
          const event: OrderEvent = {
            id: randomUUID(),
            version: "v1",
            kind: "order",
            ts: new Date().toISOString(),
            source: "internal",
            botId,
            orderId: order.id,
            venue: order.venue,
            externalId: order.externalId ?? undefined,
            side: order.side as "buy" | "sell",
            price: order.price.toString(),
            size: order.size.toString(),
            status: "canceled"
          };
          await this.persistence.logEvent(event, { market: order.market, runId });
          await this.persistence.updateOrderStatus(order.id, "canceled", event.ts);
          await this.bus.publishBotEvent(event);
          canceled += 1;
        }
      }
      console.info("[bot-runner] sync open orders", { botId, market, reason, openOnVenue: openIds.size, canceled });
    } catch (err) {
      console.warn("[bot-runner] sync open orders error", { botId, market, reason, error: (err as Error).message });
    }
  }

  private async loadPerpsRiskConfig() {
    const stored = await this.persistence.getPerpsRiskConfig();
    if (stored?.config && typeof stored.config === "object") {
      this.perpsRiskConfig = {
        ...DEFAULT_PERPS_RISK_CONFIG,
        ...(stored.config as Record<string, unknown>)
      } as typeof DEFAULT_PERPS_RISK_CONFIG;
    }
  }

  private async getExecutionEngine(botId: string, config: BotConfig) {
    if (!this.config.executionEnabled || this.config.executionMode === "disabled") {
      return this.noopExecution;
    }
    if (this.config.executionMode === "simulated") {
      return this.simulatedExecution;
    }
    if (isPerpsBot(config)) {
      return this.ensurePerpsExecution(botId);
    }
    return this.spotExecution;
  }

  private async getConnector(botId: string, config: BotConfig) {
    if (!this.config.executionEnabled || this.config.executionMode === "disabled") {
      return this.noopConnector;
    }
    if (this.config.executionMode === "simulated") {
      return this.simulatedConnector;
    }
    if (isPerpsBot(config)) {
      await this.ensurePerpsExecution(botId);
      const connector = this.perpsConnectors.get(botId);
      if (!connector) {
        throw new Error("perps connector unavailable");
      }
      return connector;
    }
    return this.spotConnector;
  }

  private async ensurePerpsExecution(botId: string) {
    const existing = this.perpsExecutions.get(botId);
    if (existing) {
      return existing;
    }
    if (!this.config.walletPubkey) {
      throw new Error("BOT_WALLET_PUBKEY is required for perps bots");
    }
    const account = await this.persistence.ensurePerpsAccount(botId, this.config.walletPubkey, "drift");
    if (!account) {
      throw new Error("perps account unavailable");
    }
    const connector = new DriftPerpsConnector({
      rpcUrl: this.config.solanaRpcUrl,
      privateKey: this.config.solanaPrivateKey,
      env: this.config.driftEnv,
      subaccountId: account.subaccountId
    });
    const execution = new ExecutionEngine(connector);
    this.perpsConnectors.set(botId, connector);
    this.perpsExecutions.set(botId, execution);
    return execution;
  }

  private async processFillFromTx(event: WalletTxEvent) {
    if (!this.config.walletPubkey) {
      return;
    }
    if (await this.persistence.fillExists(event.signature)) {
      return;
    }
    const tx = await fetchTransaction(this.config.solanaRpcUrl, event.signature);
    if (!tx) {
      return;
    }
    const parsed = parseFillFromTransaction(tx, this.config.walletPubkey);
    if (!parsed) {
      return;
    }
    const { quoteSymbol, quoteDelta, side } = parsed;
    const openOrders = await this.persistence.listOpenOrdersByQuote(quoteSymbol);
    const matched = matchOrder(openOrders, side, quoteDelta);
    if (!matched) {
      console.warn("[bot-runner] fill without matching order", {
        signature: event.signature,
        quoteSymbol,
        side,
        quoteDelta
      });
      return;
    }

    const orderPrice = Number(matched.price);
    const orderSize = Number(matched.size);
    if (!Number.isFinite(orderPrice) || !Number.isFinite(orderSize)) {
      return;
    }
    const qty = Math.min(Math.abs(quoteDelta) / orderPrice, orderSize);
    const price = orderPrice;
    const fillEvent: FillEvent = {
      id: randomUUID(),
      version: "v1",
      kind: "fill",
      ts: new Date().toISOString(),
      source: "rpc",
      botId: matched.botId,
      orderId: matched.id,
      venue: matched.venue,
      externalId: matched.externalId ?? undefined,
      side,
      price: price.toFixed(6),
      qty: qty.toFixed(6),
      txSig: event.signature
    };
    await this.persistence.logEvent(fillEvent, { market: matched.market, runId: matched.runId ?? undefined });
    await this.persistence.updateOrderStatus(matched.id, "filled", fillEvent.ts);
    await this.bus.publishBotEvent(fillEvent);
    this.applySpotFillToState(matched.botId, fillEvent);
  }

  private async reconcileSpotFills(botId: string, config: BotConfig) {
    const now = Date.now();
    const last = this.lastFillReconcileAt.get(botId) ?? 0;
    if (now - last < this.config.fillReconcileIntervalMs) {
      return;
    }
    this.lastFillReconcileAt.set(botId, now);

    const connector = await this.getConnector(botId, config);
    if (!(connector instanceof JupiterLimitOrderConnector)) {
      return;
    }

    let fills: Array<{ orderId: string; side: "buy" | "sell"; price: string; size: string; txSig?: string; filledAt?: string }>;
    try {
      fills = await connector.getRecentFills(config.market);
    } catch (err) {
      console.warn("[bot-runner] fill reconcile failed", { botId, error: (err as Error).message });
      return;
    }

    const state = this.bots.getState(botId);
    const needsRebuild = state
      ? fills.length > 0 &&
        state.startNav !== undefined &&
        state.startPrice !== undefined &&
        state.startBase !== undefined &&
        state.startQuote !== undefined &&
        (state.pnlRealized === "0" || state.pnlRealized === undefined) &&
        (state.pnlUnrealized === "0" || state.pnlUnrealized === undefined) &&
        state.inventoryBase === state.startBase &&
        state.inventoryQuote === state.startQuote
      : false;
    if (needsRebuild) {
      const sorted = [...fills].sort((a, b) => {
        const aTime = a.filledAt ? Date.parse(a.filledAt) : 0;
        const bTime = b.filledAt ? Date.parse(b.filledAt) : 0;
        return aTime - bTime;
      });
      for (const fill of sorted) {
        this.applySpotFillToStateValues(botId, fill.side, fill.price, fill.size);
      }
    }

    for (const fill of fills) {
      if (!fill.txSig) {
        continue;
      }
      const existingFill = await this.persistence.findFillByTxSig(fill.txSig);
      if (existingFill) {
        if (fill.filledAt) {
          const current = new Date(existingFill.filledAt).toISOString();
          if (current !== fill.filledAt) {
            await this.persistence.updateFillTimestamp(existingFill.id, fill.filledAt);
          }
        }
        continue;
      }
      const order = await this.persistence.findOrderByExternalId(fill.orderId);
      if (!order) {
        console.warn("[bot-runner] fill reconcile missing order", { botId, orderId: fill.orderId });
        continue;
      }
      const fillEvent: FillEvent = {
        id: randomUUID(),
        version: "v1",
        kind: "fill",
        ts: fill.filledAt ?? new Date().toISOString(),
        source: "jupiter",
        botId: order.botId,
        orderId: order.id,
        venue: order.venue,
        externalId: order.externalId ?? undefined,
        side: fill.side,
        price: fill.price,
        qty: fill.size,
        txSig: fill.txSig
      };
      await this.persistence.logEvent(fillEvent, { market: order.market, runId: order.runId ?? undefined });
      await this.persistence.updateOrderStatus(order.id, "filled", fillEvent.ts);
      await this.bus.publishBotEvent(fillEvent);
      this.applySpotFillToState(order.botId, fillEvent);
    }
  }

  private ensureSpotStartState(botId: string, config: BotConfig, lastPrice?: string) {
    const state = this.bots.getState(botId);
    if (!state || state.startNav || !lastPrice) {
      return;
    }
    const price = Number(lastPrice);
    if (!Number.isFinite(price) || price <= 0) {
      return;
    }
    const grid = config.grid;
    const startBase = grid?.maxBaseBudget ? Number(grid.maxBaseBudget) : 0;
    const startQuote = grid?.maxQuoteBudget ? Number(grid.maxQuoteBudget) : 0;
    const safeBase = Number.isFinite(startBase) ? startBase : 0;
    const safeQuote = Number.isFinite(startQuote) ? startQuote : 0;
    const startNav = safeQuote + safeBase * price;
    const equity = startNav;
    const inventoryCostQuote = safeBase * price;
    const next = this.bots.updatePerformance(botId, {
      startPrice: price.toFixed(6),
      startBase: safeBase.toFixed(6),
      startQuote: safeQuote.toFixed(6),
      startNav: Number.isFinite(startNav) ? startNav.toFixed(6) : undefined,
      inventoryBase: safeBase.toFixed(6),
      inventoryQuote: safeQuote.toFixed(6),
      inventoryCostQuote: inventoryCostQuote.toFixed(6),
      equity: Number.isFinite(equity) ? equity.toFixed(6) : undefined,
      pnlRealized: "0",
      pnlUnrealized: "0"
    });
    void this.bus.setCache(CACHE_KEYS.bot(botId), next);
  }

  private applySpotFillToState(botId: string, fill: FillEvent) {
    this.applySpotFillToStateValues(botId, fill.side, fill.price, fill.qty);
  }

  private applySpotFillToStateValues(botId: string, side: "buy" | "sell", priceRaw: string, qtyRaw: string) {
    const state = this.bots.getState(botId);
    if (!state) {
      return;
    }
    const price = Number(priceRaw);
    const qty = Number(qtyRaw);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0 || price <= 0) {
      return;
    }
    let base = Number(state.inventoryBase ?? 0);
    let quote = Number(state.inventoryQuote ?? 0);
    let costQuote = Number(state.inventoryCostQuote ?? 0);
    let realized = Number(state.pnlRealized ?? 0);
    if (!Number.isFinite(base)) {
      base = 0;
    }
    if (!Number.isFinite(quote)) {
      quote = 0;
    }
    if (!Number.isFinite(costQuote)) {
      costQuote = 0;
    }
    if (!Number.isFinite(realized)) {
      realized = 0;
    }

    if (side === "buy") {
      base += qty;
      const quoteDelta = price * qty;
      quote -= quoteDelta;
      costQuote += quoteDelta;
    } else {
      const avgCost = base > 0 ? costQuote / base : price;
      base -= qty;
      const quoteDelta = price * qty;
      quote += quoteDelta;
      realized += (price - avgCost) * qty;
      costQuote -= avgCost * qty;
    }

    if (base < 0 || !Number.isFinite(base)) {
      base = 0;
    }
    if (base === 0) {
      costQuote = 0;
    }

    const lastPrice = Number(state.lastPrice ?? priceRaw);
    const equity = Number.isFinite(lastPrice) ? quote + base * lastPrice : null;
    const unrealized = Number.isFinite(lastPrice) ? base * lastPrice - costQuote : null;
    const next = this.bots.updatePerformance(botId, {
      inventoryBase: base.toFixed(6),
      inventoryQuote: quote.toFixed(6),
      inventoryCostQuote: costQuote.toFixed(6),
      pnlRealized: realized.toFixed(6),
      pnlUnrealized: unrealized !== null ? unrealized.toFixed(6) : state.pnlUnrealized,
      equity: equity !== null ? equity.toFixed(6) : state.equity
    });
    void this.bus.setCache(CACHE_KEYS.bot(botId), next);
  }

  private maybeSnapshot(state: BotState) {
    if (!this.config.persistenceEnabled) {
      return;
    }
    const now = Date.now();
    const last = this.lastSnapshotAt.get(state.botId) ?? 0;
    if (now - last < this.config.snapshotIntervalMs) {
      return;
    }
    this.lastSnapshotAt.set(state.botId, now);
    void this.persistence.saveBotSnapshot(state);
  }

  private async checkHealth() {
    const now = Date.now();
    const stale = now - this.lastMarketEventAt > this.config.staleSeconds * 1000;
    await this.bus.publishHealth(
      "bot-runner",
      stale ? "degraded" : "ok",
      stale ? "market-data stale" : undefined
    );
  }

  private async simulateFills(botId: string, price: string) {
    const openOrders = await this.persistence.listOpenOrders(botId);
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice)) {
      return;
    }
    for (const order of openOrders) {
      const orderPrice = Number(order.price);
      if (!Number.isFinite(orderPrice)) {
        continue;
      }
      const shouldFill =
        (order.side === "buy" && numericPrice <= orderPrice) ||
        (order.side === "sell" && numericPrice >= orderPrice);
      if (!shouldFill) {
        continue;
      }
      const fillEvent: FillEvent = {
        id: randomUUID(),
        version: "v1",
        kind: "fill",
        ts: new Date().toISOString(),
        source: "internal" as const,
        botId,
        orderId: order.id,
        venue: order.venue,
        externalId: order.externalId ?? undefined,
        side: order.side as "buy" | "sell",
        price: order.price.toString(),
        qty: order.size.toString()
      };
      await this.persistence.logEvent(fillEvent, { market: order.market, runId: order.runId ?? undefined });
      await this.persistence.updateOrderStatus(order.id, "filled", fillEvent.ts);
      await this.bus.publishBotEvent(fillEvent);
    }
  }

  private async maybeAccountSnapshot() {
    if (!this.config.persistenceEnabled || !this.config.walletPubkey) {
      return;
    }
    if (this.walletBalances.size === 0) {
      return;
    }
    const now = Date.now();
    if (now - this.lastAccountSnapshotAt < this.config.accountSnapshotIntervalMs) {
      return;
    }
    this.lastAccountSnapshotAt = now;
    const snapshot = this.buildAccountSnapshot(this.config.walletPubkey);
    await this.persistence.saveAccountSnapshot(snapshot);
  }

  private buildAccountSnapshot(walletId: string) {
    const balances = Array.from(this.walletBalances.entries()).map(([mint, entry]) => {
      const token = getTokenByMint(mint, this.config.solanaCluster);
      const symbol = mint === "SOL" ? "SOL" : token?.symbol ?? null;
      const amount = entry.balance;
      const priceUsd = resolveUsdPrice(symbol, this.market);
      const numericAmount = Number(amount);
      const usdValue =
        priceUsd !== null && Number.isFinite(numericAmount) ? (numericAmount * priceUsd).toFixed(2) : null;
      return {
        mint,
        symbol,
        amount,
        priceUsd: priceUsd !== null ? priceUsd.toFixed(6) : null,
        usdValue
      };
    });

    const equity = balances.reduce((total, balance) => {
      const value = balance.usdValue ? Number(balance.usdValue) : 0;
      return Number.isFinite(value) ? total + value : total;
    }, 0);

    balances.sort((a, b) => {
      const aValue = a.usdValue ? Number(a.usdValue) : 0;
      const bValue = b.usdValue ? Number(b.usdValue) : 0;
      return bValue - aValue;
    });

    return {
      walletId,
      ts: new Date().toISOString(),
      equity: Number.isFinite(equity) ? equity.toFixed(2) : null,
      balances
    };
  }

  private async fetchVenueOpenOrders(botId: string, config: BotConfig) {
    const connector = await this.getConnector(botId, config);
    const attempts = 3;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await connector.getOpenOrders(config.market);
      } catch (err) {
        lastError = err as Error;
        await sleep(250 * (attempt + 1));
      }
    }
    console.warn("[bot-runner] pre-trade open order fetch failed", {
      botId,
      market: config.market,
      error: lastError?.message ?? "unknown error"
    });
    return null;
  }
}

function parseEnvelope(message: string): RedisEnvelope<NormalizedEvent> | null {
  try {
    const payload = JSON.parse(message) as RedisEnvelope<NormalizedEvent>;
    if (!payload || payload.version !== "v1" || !payload.data) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parseCommand(message: string): BotCommand | null {
  try {
    const payload = JSON.parse(message) as BotCommand;
    if (!payload || payload.version !== "v1" || !payload.botId || !payload.action) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function resolveMarketSymbol(config: BotConfig) {
  if (config.grid?.symbol) {
    return config.grid.symbol;
  }
  if (config.perps?.simpleGrid?.symbol) {
    return config.perps.simpleGrid.symbol;
  }
  if (config.perps?.curveGrid?.symbol) {
    return config.perps.curveGrid.symbol;
  }
  if (config.marketMaker?.symbol) {
    return config.marketMaker.symbol;
  }
  if (config.market?.includes("/")) {
    return config.market.split("/")[0];
  }
  return config.market || null;
}

function isPerpsBot(config: BotConfig) {
  const kind = config.kind ?? (config.venue === "drift_perps" ? "drift_perps" : "spot");
  return kind === "drift_perps";
}

type StrategyOrder = {
  id: string;
  externalId?: string;
  side: "buy" | "sell";
  price: string;
  size: string;
  status: "new" | "open" | "partial" | "filled" | "canceled" | "rejected";
};

function mergeStrategyOrders(left: StrategyOrder[], right: StrategyOrder[]) {
  const seen = new Set<string>();
  const merged: StrategyOrder[] = [];
  for (const order of [...left, ...right]) {
    const key =
      order.externalId ?? `${order.side}:${order.price}:${order.size}:${order.status}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(order);
  }
  return merged;
}

function filterSpotIntents(
  intents: Intent[],
  config: BotConfig,
  walletBalances: Map<string, { balance: string }>
) {
  const grid = config.grid;
  if (!grid || !config.market) {
    return intents;
  }
  const [baseSymbol, quoteSymbol] = config.market.includes("/")
    ? config.market.split("/")
    : config.market.split("-");
  const baseMint = baseSymbol ? TOKEN_MINTS[baseSymbol as keyof typeof TOKEN_MINTS]?.mint : undefined;
  const quoteMint = quoteSymbol ? TOKEN_MINTS[quoteSymbol as keyof typeof TOKEN_MINTS]?.mint : undefined;
  if (!baseMint || !quoteMint) {
    return intents;
  }
  const baseBalance =
    baseSymbol === "SOL"
      ? Number(walletBalances.get(baseMint)?.balance ?? walletBalances.get("SOL")?.balance ?? 0)
      : Number(walletBalances.get(baseMint)?.balance ?? 0);
  const quoteBalance =
    quoteSymbol === "SOL"
      ? Number(walletBalances.get(quoteMint)?.balance ?? walletBalances.get("SOL")?.balance ?? 0)
      : Number(walletBalances.get(quoteMint)?.balance ?? 0);
  if (!Number.isFinite(baseBalance) || !Number.isFinite(quoteBalance)) {
    return intents;
  }
  let remainingBase = baseBalance;
  let remainingQuote = quoteBalance;
  const maxBase = Number(grid.maxBaseBudget);
  const maxQuote = Number(grid.maxQuoteBudget);
  if (Number.isFinite(maxBase) && maxBase > 0) {
    remainingBase = Math.min(remainingBase, maxBase);
  }
  if (Number.isFinite(maxQuote) && maxQuote > 0) {
    remainingQuote = Math.min(remainingQuote, maxQuote);
  }
  const budgetEpsilon = 1e-9;
  const filtered: Intent[] = [];
  for (const intent of intents) {
    if (intent.kind !== "place_limit_order") {
      filtered.push(intent);
      continue;
    }
    const size = Number(intent.size);
    const price = Number(intent.price);
    if (!Number.isFinite(size) || !Number.isFinite(price) || size <= 0 || price <= 0) {
      continue;
    }
    if (intent.side === "buy") {
      const quoteNeeded = size * price;
      if (remainingQuote + budgetEpsilon >= quoteNeeded) {
        remainingQuote -= quoteNeeded;
        filtered.push(intent);
      }
      continue;
    }
    if (remainingBase + budgetEpsilon >= size) {
      remainingBase -= size;
      filtered.push(intent);
    }
  }
  return filtered;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveUsdPrice(symbol: string | null, market: MarketStateStore) {
  if (!symbol) {
    return null;
  }
  if (symbol === "USDC" || symbol === "USDT" || symbol === "USD") {
    return 1;
  }
  const marketState = market.get(symbol);
  if (!marketState?.lastPrice) {
    return null;
  }
  const parsed = Number(marketState.lastPrice);
  return Number.isFinite(parsed) ? parsed : null;
}

const TOKEN_MINTS = {
  SOL: { symbol: "SOL", mint: "So11111111111111111111111111111111111111112" },
  USDC: { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  USDT: { symbol: "USDT", mint: "Es9vMFrzaCER1a6c7fggkP6yqoCqkf9rD8qt4V9rW" }
} as const;

const MINT_TO_SYMBOL = new Map(Object.values(TOKEN_MINTS).map((token) => [token.mint, token.symbol]));

type ParsedFill = {
  quoteSymbol: string;
  quoteDelta: number;
  side: "buy" | "sell";
};

async function fetchTransaction(rpcUrl: string, signature: string) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTransaction",
    params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
  };
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as { result?: any };
  return payload?.result ?? null;
}

function parseFillFromTransaction(tx: any, wallet: string): ParsedFill | null {
  const meta = tx?.meta;
  const message = tx?.transaction?.message;
  if (!meta || !message) {
    return null;
  }
  const preTokens = buildTokenMap(meta.preTokenBalances, wallet);
  const postTokens = buildTokenMap(meta.postTokenBalances, wallet);

  const deltas = new Map<string, number>();
  for (const [mint, amount] of postTokens.entries()) {
    const before = preTokens.get(mint) ?? 0;
    deltas.set(mint, amount - before);
  }
  for (const [mint, amount] of preTokens.entries()) {
    if (!deltas.has(mint)) {
      deltas.set(mint, 0 - amount);
    }
  }

  const quoteMint = deltas.has(TOKEN_MINTS.USDC.mint)
    ? TOKEN_MINTS.USDC.mint
    : deltas.has(TOKEN_MINTS.USDT.mint)
      ? TOKEN_MINTS.USDT.mint
      : null;

  if (!quoteMint) {
    return null;
  }

  const quoteDelta = deltas.get(quoteMint) ?? 0;
  if (quoteDelta === 0) {
    return null;
  }
  const side: "buy" | "sell" = quoteDelta < 0 ? "buy" : "sell";
  const quoteSymbol = MINT_TO_SYMBOL.get(quoteMint) ?? "USDC";

  if (!Number.isFinite(quoteDelta)) {
    return null;
  }

  return { quoteSymbol, quoteDelta, side };
}

function buildTokenMap(entries: any[] | undefined, owner: string) {
  const map = new Map<string, number>();
  for (const entry of entries ?? []) {
    if (entry?.owner !== owner) {
      continue;
    }
    const mint = entry?.mint;
    const amount = entry?.uiTokenAmount?.uiAmountString;
    if (!mint || amount === undefined || amount === null) {
      continue;
    }
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    map.set(mint, numeric);
  }
  return map;
}

function matchOrder(
  orders: Array<{
    id: string;
    botId: string;
    runId?: string | null;
    venue: string;
    market: string;
    externalId?: string | null;
    side: string;
    price: any;
    size: any;
  }>,
  side: "buy" | "sell",
  quoteDelta: number
) {
  const targetQuote = Math.abs(quoteDelta);
  const candidates = orders.filter((order) => order.side === side);
  let best: typeof candidates[number] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const order of candidates) {
    const orderPrice = Number(order.price);
    const orderSize = Number(order.size);
    if (!Number.isFinite(orderPrice) || !Number.isFinite(orderSize)) {
      continue;
    }
    const expectedQuote = orderPrice * orderSize;
    const quoteDiff = Math.abs(expectedQuote - targetQuote) / targetQuote;
    if (quoteDiff > 0.25) {
      continue;
    }
    if (quoteDiff < bestScore) {
      bestScore = quoteDiff;
      best = order;
    }
  }
  return best;
}
