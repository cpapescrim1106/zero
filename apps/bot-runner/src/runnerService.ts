import type { BotCommand, BotConfig, BotState, NormalizedEvent, PriceEvent, RedisEnvelope } from "@zero/core";
import { CACHE_KEYS } from "@zero/core";
import { JupiterLimitOrderConnector } from "@zero/connectors";
import type { Strategy } from "@zero/strategies";
import type { BotRunnerConfig } from "./config";
import { BotManager } from "./botManager";
import { IntentEngine } from "./intentEngine";
import { MarketStateStore } from "./marketState";
import { Persistence } from "./persistence";
import { RedisBus } from "./redisBus";
import { RiskGovernor } from "./riskGovernor";
import { buildStrategyRegistry } from "./strategyRegistry";

export class BotRunnerService {
  private bus: RedisBus;
  private bots = new BotManager();
  private market = new MarketStateStore();
  private intents = new IntentEngine();
  private risk = new RiskGovernor();
  private strategies = buildStrategyRegistry();
  private connector: JupiterLimitOrderConnector;
  private persistence: Persistence;
  private lastMarketEventAt = Date.now();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(private config: BotRunnerConfig) {
    this.bus = new RedisBus(config.redisUrl);
    this.connector = new JupiterLimitOrderConnector({
      apiUrl: config.jupiterApiUrl,
      privateKey: config.solanaPrivateKey
    });
    this.persistence = new Persistence(config.databaseUrl, config.persistenceEnabled);
  }

  async start() {
    this.bus.onPattern("cmd:bot:*", (channel, message) => this.handleCommand(channel, message));
    this.bus.onPattern("md:price:*", (channel, message) => this.handleMarketEvent(channel, message));

    await this.loadBots();

    this.heartbeatTimer = setInterval(() => {
      void this.checkHealth();
    }, this.config.heartbeatIntervalMs);
    await this.checkHealth();
  }

  async stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
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
  }

  private async loadBots() {
    const bots = await this.persistence.listBots();
    for (const bot of bots) {
      const state = this.bots.setConfig(bot.id, bot.config as BotConfig, bot.status as BotState["status"]);
      await this.bus.setCache(CACHE_KEYS.bot(bot.id), state);
    }
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

    if (decision.allowedIntents.length > 0) {
      console.log("[bot-runner] intents ready", {
        botId,
        count: decision.allowedIntents.length
      });
    }
  }

  private getStrategy(config: BotConfig): Strategy | undefined {
    return this.strategies.get(config.strategyKey);
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
