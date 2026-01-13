export type BotStatus = "starting" | "running" | "paused" | "stopped" | "error";
export type BotMode = "static" | "dynamic";
export type BotKind = "spot" | "drift_perps";

export type StrategyKey =
  | "spot_grid_static"
  | "spot_grid_dynamic"
  | "spot_mm_slow"
  | "perps_grid_simple"
  | "perps_grid_curve";

export interface GridConfig {
  symbol: string;
  lowerPrice: string;
  upperPrice: string;
  gridCount: number;
  orderSize: string;
  maxQuoteBudget?: string;
  maxBaseBudget?: string;
}

export interface MarketMakerConfig {
  symbol: string;
  orderSize: string;
  levels: number;
  halfSpreadBps: number;
  levelSpacingBps: number;
  refreshSeconds: number;
  repriceBps: number;
}

export interface RecenterConfig {
  timeMinutes: number;
  distanceBps: number;
  behavior: "full_rebuild" | "walk" | "hybrid";
}

export interface PerpsSimpleGridConfig {
  symbol: string;
  lowerPrice: string;
  upperPrice: string;
  gridCount: number;
  orderSize: string;
}

export interface PerpsCurveGridConfig {
  symbol: string;
  levels: number;
  stepPercent: number;
  baseSize: string;
  bias: "bullish" | "neutral" | "bearish";
  lookbackWeights?: {
    "1h"?: number;
    "4h"?: number;
    "1d"?: number;
    "1w"?: number;
  };
  percentileBand?: {
    min: number;
    max: number;
  };
  rangeMode?: "bounded" | "infinite";
}

export interface PerpsConfig {
  strategy: "simple_grid" | "curve_grid";
  simpleGrid?: PerpsSimpleGridConfig;
  curveGrid?: PerpsCurveGridConfig;
  targetPosition?: {
    base: string;
  };
  exposureBand?: {
    minBase: string;
    maxBase: string;
    preferredBase?: string;
  };
}

export interface BotConfig {
  name: string;
  strategyKey: StrategyKey;
  venue: string;
  market: string;
  mode: BotMode;
  kind?: BotKind;
  grid?: GridConfig;
  marketMaker?: MarketMakerConfig;
  recenter?: RecenterConfig;
  perps?: PerpsConfig;
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

export interface PerpsRiskConfig {
  liquidationBufferPct: number;
  liquidationBufferHealthRatio: number;
  leverageCap: number;
  maxDailyLoss: string;
  maxNotional: string;
  fundingGuardrailBps: number;
  markOracleDivergenceBps: number;
  reduceOnlyTriggerBps: number;
}

export interface RiskBreach {
  reason:
    | "max_notional"
    | "max_base_inventory"
    | "max_daily_loss"
    | "max_slippage"
    | "stale_market_data"
    | "liquidation_buffer"
    | "leverage_cap"
    | "funding_guardrail"
    | "mark_oracle_divergence"
    | "reduce_only_trigger";
  triggeredAt: string;
  context?: Record<string, unknown>;
}

export interface RiskState {
  status: "ok" | "reduce_only" | "shrink" | "clamp" | "paused";
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
  scheduleActive?: boolean;
  lastPrice?: string;
  inventoryBase?: string;
  inventoryQuote?: string;
  pnlUnrealized?: string;
  pnlRealized?: string;
  equity?: string;
  lastEventAt?: string;
  risk: RiskState;
}
