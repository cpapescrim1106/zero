import type { BotConfig, BotState, Intent } from "@zero/core";

export interface MarketState {
  symbol: string;
  lastPrice?: string;
  markPrice?: string;
  bid?: string;
  ask?: string;
  oraclePrice?: string;
  fundingRate?: string;
  nextFundingTime?: string;
  markOracleDivergenceBps?: number;
  volatility?: string;
  ts?: string;
}

export interface StrategyOrder {
  id: string;
  externalId?: string;
  side: "buy" | "sell";
  price: string;
  size: string;
  status: "new" | "open" | "partial" | "filled" | "canceled" | "rejected";
}

export interface StrategyContext {
  botConfig: BotConfig;
  botState: BotState;
  market: MarketState;
  openOrders: StrategyOrder[];
}

export interface Strategy {
  key: string;
  run(context: StrategyContext): Promise<Intent[]>;
}
