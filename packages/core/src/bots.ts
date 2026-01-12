export type BotStatus = "starting" | "running" | "paused" | "stopped" | "error";
export type BotMode = "static" | "dynamic";

export type StrategyKey = "spot_grid_static" | "spot_grid_dynamic";

export interface GridConfig {
  symbol: string;
  lowerPrice: string;
  upperPrice: string;
  gridCount: number;
  orderSize: string;
}

export interface RecenterConfig {
  timeMinutes: number;
  distanceBps: number;
  behavior: "full_rebuild" | "walk" | "hybrid";
}

export interface BotConfig {
  name: string;
  strategyKey: StrategyKey;
  venue: string;
  market: string;
  mode: BotMode;
  grid: GridConfig;
  recenter?: RecenterConfig;
  schedule?: {
    timezone: string;
    windows: Array<{ start: string; end: string }>;
  };
}

export interface RiskLimits {
  maxNotional: string;
  maxBaseInventory: string;
  maxDailyLoss: string;
  maxSlippageBps: number;
  maxStaleSeconds: number;
}

export interface RiskBreach {
  reason:
    | "max_notional"
    | "max_base_inventory"
    | "max_daily_loss"
    | "max_slippage"
    | "stale_market_data";
  triggeredAt: string;
  context?: Record<string, unknown>;
}

export interface RiskState {
  status: "ok" | "reduce_only" | "shrink" | "paused";
  lastCheckedAt: string;
  breaches: RiskBreach[];
  hardStop?: RiskBreach;
}

export interface BotState {
  botId: string;
  runId?: string;
  status: BotStatus;
  mode: BotMode;
  market: string;
  venue: string;
  lastPrice?: string;
  inventoryBase?: string;
  inventoryQuote?: string;
  pnlUnrealized?: string;
  pnlRealized?: string;
  equity?: string;
  lastEventAt?: string;
  risk: RiskState;
}
