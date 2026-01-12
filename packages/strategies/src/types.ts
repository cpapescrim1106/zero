import type { BotConfig, BotState, Intent } from "@zero/core";

export interface MarketState {
  symbol: string;
  lastPrice?: string;
  bid?: string;
  ask?: string;
  ts?: string;
}

export interface StrategyContext {
  botConfig: BotConfig;
  botState: BotState;
  market: MarketState;
}

export interface Strategy {
  key: string;
  run(context: StrategyContext): Promise<Intent[]>;
}
