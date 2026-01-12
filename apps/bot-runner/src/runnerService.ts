import type { BotCommand, BotConfig, BotState, NormalizedEvent, PriceEvent, RedisEnvelope } from "@zero/core";
import { CACHE_KEYS } from "@zero/core";
import { JupiterLimitOrderConnector } from "@zero/connectors";
import type { Strategy } from "@zero/strategies";
import type { BotRunnerConfig } from "./config";
import { BotManager } from "./botManager";
import { ExecutionEngine } from "./executionEngine";
import { IntentEngine } from "./intentEngine";
import { MarketStateStore } from "./marketState";
import { Persistence } from "./persistence";
import { RedisBus } from "./redisBus";
import { RiskGovernor } from "./riskGovernor";
import { isScheduleActive } from "./schedule";
import { buildStrategyRegistry } from "./strategyRegistry";

export class BotRunnerService {
  private bus: RedisBus;
  private bots = new BotManager();
  private market = new MarketStateStore();
  private intents = new IntentEngine();
  private risk = new RiskGovernor();
  private execution: ExecutionEngine;
  private strategies = buildStrategyRegistry();
  private connector: JupiterLimitOrderConnector;
  private persistence: Persistence;
  private lastMarketEventAt = Date.now();
  private heartbeatTimer?: NodeJS.Timeout;
  private scheduleTimer?: NodeJS.Timeout;
  private reconcileTimer?: NodeJS.Timeout;

  constructor(private config: BotRunnerConfig) {
    this.bus = new RedisBus(config.redisUrl);
    this.connector = new JupiterLimitOrderConnector({
      apiUrl: config.jupiterApiUrl,
      privateKey: config.solanaPrivateKey
    });
    this.execution = new ExecutionEngine(this.connector);
    this.persistence = new Persistence(config.databaseUrl, config.persistenceEnabled);
  }

  async start() {
    this.bus.onPattern("cmd:bot:*", (channel, message) => this.handleCommand(channel, message));
    this.bus.onPattern("md:price:*", (channel, message) => this.handleMarketEvent(channel, message));

    await this.loadBots();

    this.heartbeatTimer = setInterval(() => {
      void this.checkHealth();
    }, this.config.heartbeatIntervalMs);
    this.scheduleTimer = setInterval(() => {
      void this.refreshSchedules();
    }, 30000);
    this.reconcileTimer = setInterval(() => {
      void this.reconcileBots();
    }, this.config.reconcileIntervalMs);
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
    void this.bus.setCache(CACHE_KEYS.bot(command.botId), result.state);
    void this.persistence.logEvent(result.event);
    void this.persistence.saveBotSnapshot(result.state);
    void this.applySchedule(command.botId);
  }

  private async loadBots() {
    const bots = await this.persistence.listBots();
    for (const bot of bots) {
      const state = this.bots.setConfig(bot.id, bot.config as BotConfig, bot.status as BotState["status"]);
      await this.bus.setCache(CACHE_KEYS.bot(bot.id), state);
    }
    await this.refreshSchedules();
  }

  private handleMarketEvent(_channel: string, message: string) {
    const envelope = parseEnvelope(message);
    if (!envelope || envelope.kind !== "price") {
      return;
    }

    const event = envelope.data as PriceEvent;
    this.lastMarketEventAt = Date.now();
    this.market.applyPrice(event);
    const updated = this.bots.updatePriceForSymbol(event.symbol, event.price, event.ts);
    for (const state of updated) {
      void this.bus.setCache(CACHE_KEYS.bot(state.botId), state);
      void this.evaluateBot(state.botId);
    }
  }

  private async evaluateBot(botId: string) {
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

    const market = this.market.get(config.grid.symbol);
    if (!market) {
      return;
    }
    const strategy = this.getStrategy(config);
    if (!strategy) {
      return;
    }

    const intents = await this.intents.run(strategy, {
      botConfig: config,
      botState: state,
      market
    });

    const decision = this.risk.evaluate(state.risk, intents, botId);
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

    const execution = await this.execution.execute(botId, decision.allowedIntents);
    for (const event of execution.events) {
      if (event.botId) {
        await this.bus.publishBotEvent(event);
        await this.persistence.logEvent(event);
      }
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
        await this.connector.reconcile(config.market);
      } catch (err) {
        console.warn("[bot-runner] reconcile failed", { botId, error: (err as Error).message });
      }
    }
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
