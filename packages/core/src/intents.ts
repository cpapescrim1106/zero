export type IntentKind =
  | "place_limit_order"
  | "cancel_limit_order"
  | "cancel_all"
  | "replace_limit_order";

export interface BaseIntent {
  id: string;
  botId: string;
  kind: IntentKind;
  createdAt: string; // ISO timestamp
  reason?: string;
}

export interface PlaceLimitOrderIntent extends BaseIntent {
  kind: "place_limit_order";
  symbol: string;
  side: "buy" | "sell";
  price: string; // decimal string
  size: string; // decimal string
  clientOrderId?: string;
  reduceOnly?: boolean;
}

export interface CancelLimitOrderIntent extends BaseIntent {
  kind: "cancel_limit_order";
  orderId: string;
  externalId?: string;
  side?: "buy" | "sell";
  price?: string;
  size?: string;
}

export interface CancelAllIntent extends BaseIntent {
  kind: "cancel_all";
  symbol: string;
}

export interface ReplaceLimitOrderIntent extends BaseIntent {
  kind: "replace_limit_order";
  orderId: string;
  newPrice: string;
  newSize: string;
}

export type Intent =
  | PlaceLimitOrderIntent
  | CancelLimitOrderIntent
  | CancelAllIntent
  | ReplaceLimitOrderIntent;
