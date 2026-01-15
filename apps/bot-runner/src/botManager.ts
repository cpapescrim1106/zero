import { randomUUID } from "crypto";
import type { BotCommand, BotConfig, BotEvent, BotState, RiskState } from "@zero/core";

export interface BotManagerResult {
  state: BotState;
  event: BotEvent;
}

export class BotManager {
  private states = new Map<string, BotState>();
  private configs = new Map<string, BotConfig>();

  handleCommand(command: BotCommand): BotManagerResult {
    if (command.action === "update_config" && command.payload?.config) {
      this.configs.set(command.botId, command.payload.config as BotConfig);
    }

    const config = this.configs.get(command.botId);
    const state = this.ensureState(command.botId, config);
    const ts = new Date().toISOString();

    let status = state.status;
    let message = "";

    switch (command.action) {
      case "start":
        status = "running";
        message = "bot started";
        break;
      case "stop":
        status = "stopped";
        message = "bot stopped";
        break;
      case "pause":
        status = "paused";
        message = "bot paused";
        break;
      case "resume":
        status = "running";
        message = "bot resumed";
        break;
      case "update_config":
        message = "bot config updated";
        break;
      default:
        message = "unknown command";
        break;
    }

    state.status = status;
    state.lastEventAt = ts;
    if (config) {
      state.market = config.market;
      state.venue = config.venue;
      state.mode = config.mode;
    }

    const event: BotEvent = {
      id: randomUUID(),
      version: "v1",
      kind: "bot",
      ts,
      source: "internal",
      botId: command.botId,
      status,
      message
    };

    this.states.set(command.botId, state);

    return { state, event };
  }

  updatePrice(botId: string, price: string, ts: string) {
    const state = this.ensureState(botId);
    state.lastPrice = price;
    state.lastEventAt = ts;
    this.states.set(botId, state);
    return state;
  }

  updatePriceForSymbol(symbol: string, price: string, ts: string) {
    const updated: BotState[] = [];
    for (const [botId, config] of this.configs.entries()) {
      if (!matchesSymbol(config, symbol)) {
        continue;
      }
      updated.push(this.updatePrice(botId, price, ts));
    }
    return updated;
  }

  setConfig(botId: string, config: BotConfig, status?: BotState["status"]) {
    this.configs.set(botId, config);
    const state = this.ensureState(botId, config);
    state.market = config.market;
    state.venue = config.venue;
    state.mode = config.mode;
    if (status) {
      state.status = status;
    }
    state.lastEventAt = new Date().toISOString();
    this.states.set(botId, state);
    return state;
  }

  updateRisk(botId: string, risk: RiskState) {
    const state = this.ensureState(botId);
    state.risk = risk;
    this.states.set(botId, state);
    return state;
  }

  updateScheduleActive(botId: string, active: boolean) {
    const state = this.ensureState(botId);
    state.scheduleActive = active;
    state.lastEventAt = new Date().toISOString();
    this.states.set(botId, state);
    return state;
  }

  updatePerformance(botId: string, updates: Partial<BotState>) {
    const state = this.ensureState(botId);
    Object.assign(state, updates);
    state.lastEventAt = new Date().toISOString();
    this.states.set(botId, state);
    return state;
  }

  setRunId(botId: string, runId?: string) {
    const state = this.ensureState(botId);
    state.runId = runId;
    state.lastEventAt = new Date().toISOString();
    this.states.set(botId, state);
    return state;
  }

  getState(botId: string) {
    return this.states.get(botId);
  }

  getConfig(botId: string) {
    return this.configs.get(botId);
  }

  listBotIds() {
    return Array.from(this.states.keys());
  }

  private ensureState(botId: string, config?: BotConfig): BotState {
    const existing = this.states.get(botId);
    if (existing) {
      return existing;
    }
    const risk: RiskState = {
      status: "ok",
      lastCheckedAt: new Date().toISOString(),
      breaches: []
    };
    return {
      botId,
      runId: undefined,
      status: "stopped",
      mode: config?.mode ?? "static",
      market: config?.market ?? "",
      venue: config?.venue ?? "",
      scheduleActive: true,
      risk
    };
  }
}

function matchesSymbol(config: BotConfig, symbol: string) {
  if (config.grid?.symbol === symbol) {
    return true;
  }
  if (config.perps?.simpleGrid?.symbol === symbol) {
    return true;
  }
  if (config.perps?.curveGrid?.symbol === symbol) {
    return true;
  }
  if (config.marketMaker?.symbol === symbol) {
    return true;
  }
  if (!config.market) {
    return false;
  }
  return config.market.startsWith(symbol);
}
