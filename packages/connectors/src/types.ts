import type {
  CancelAllIntent,
  CancelLimitOrderIntent,
  PlaceLimitOrderIntent,
  ReplaceLimitOrderIntent
} from "@zero/core";

export interface ExecutionResult {
  ok: boolean;
  externalId?: string;
  error?: string;
  meta?: {
    canceled?: number;
  };
}

export interface OpenOrder {
  orderId: string;
  externalId?: string;
  side: "buy" | "sell";
  price: string;
  size: string;
  status: "open" | "partial" | "filled" | "canceled";
}

export interface ReconcileResult {
  ok: boolean;
  message?: string;
}

export interface ExecutionConnector {
  venue: string;
  placeLimitOrder(intent: PlaceLimitOrderIntent): Promise<ExecutionResult>;
  cancelLimitOrder(intent: CancelLimitOrderIntent): Promise<ExecutionResult>;
  cancelAll(intent: CancelAllIntent): Promise<ExecutionResult>;
  replaceLimitOrder(intent: ReplaceLimitOrderIntent): Promise<ExecutionResult>;
  getOpenOrders(market: string): Promise<OpenOrder[]>;
  reconcile(market: string): Promise<ReconcileResult>;
}
