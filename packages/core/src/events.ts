export type EventVersion = "v1";

export type EventKind =
  | "price"
  | "perps_market"
  | "balance"
  | "wallet_tx"
  | "intent"
  | "order"
  | "fill"
  | "bot"
  | "risk"
  | "health";

export type EventSource =
  | "helius"
  | "rpc"
  | "jupiter"
  | "drift"
  | "internal"
  | "coingecko"
  | "kraken"
  | "manual";

export interface BaseEvent {
  id: string;
  version: EventVersion;
  kind: EventKind;
  ts: string; // ISO timestamp
  source: EventSource;
  botId?: string;
  correlationId?: string;
}

export interface PriceEvent extends BaseEvent {
  kind: "price";
  symbol: string;
  price: string; // decimal string
  bid?: string;
  ask?: string;
  slot?: number;
}

export interface PerpsMarketEvent extends BaseEvent {
  kind: "perps_market";
  market: string;
  markPrice: string;
  bid?: string;
  ask?: string;
  oraclePrice?: string;
  fundingRate?: string;
  nextFundingTime?: string;
  markOracleDivergenceBps?: number;
  volatility?: string;
}

export interface BalanceEvent extends BaseEvent {
  kind: "balance";
  walletId: string;
  tokenMint: string;
  balance: string; // decimal string
  delta?: string; // decimal string
  slot?: number;
}

export interface WalletTxEvent extends BaseEvent {
  kind: "wallet_tx";
  walletId: string;
  signature: string;
  status: "confirmed" | "finalized" | "failed";
  slot?: number;
}

export interface OrderEvent extends BaseEvent {
  kind: "order";
  orderId: string;
  venue: string;
  externalId?: string;
  side: "buy" | "sell";
  price?: string;
  size?: string;
  status: "new" | "open" | "partial" | "filled" | "canceled" | "rejected";
  error?: string;
}

export interface FillEvent extends BaseEvent {
  kind: "fill";
  orderId: string;
  venue: string;
  externalId?: string;
  side: "buy" | "sell";
  price: string;
  qty: string;
  fee?: string;
  realizedPnl?: string;
  txSig?: string;
}

export interface BotEvent extends BaseEvent {
  kind: "bot";
  botId: string;
  status: "starting" | "running" | "paused" | "stopped" | "error";
  message?: string;
}

export interface IntentEvent extends BaseEvent {
  kind: "intent";
  botId: string;
  intent: unknown;
}

export interface RiskEvent extends BaseEvent {
  kind: "risk";
  botId: string;
  reason:
    | "max_notional"
    | "max_base_inventory"
    | "max_daily_loss"
    | "max_slippage"
    | "stale_market_data"
    | "manual_pause"
    | "liquidation_buffer"
    | "leverage_cap"
    | "funding_guardrail"
    | "mark_oracle_divergence"
    | "reduce_only_trigger";
  action: "reduce_only" | "shrink" | "clamp" | "pause";
  context?: Record<string, unknown>;
}

export interface HealthEvent extends BaseEvent {
  kind: "health";
  service: "api" | "web" | "market-data" | "bot-runner";
  status: "ok" | "degraded" | "down";
  message?: string;
}

export type NormalizedEvent =
  | PriceEvent
  | PerpsMarketEvent
  | BalanceEvent
  | WalletTxEvent
  | IntentEvent
  | OrderEvent
  | FillEvent
  | BotEvent
  | RiskEvent
  | HealthEvent;
