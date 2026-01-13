import type { BotRuntime } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    }
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "API request failed");
  }
  return (await res.json()) as T;
}

export interface ApiBot {
  id: string;
  name: string;
  strategyKey: string;
  venue: string;
  market: string;
  config: Record<string, unknown>;
  riskConfig: Record<string, unknown>;
  schedule?: Record<string, unknown> | null;
  status: string;
  runtime?: BotRuntime;
}

export interface BotsResponse {
  ok: boolean;
  bots: ApiBot[];
}

export interface BotResponse {
  ok: boolean;
  bot: ApiBot;
}

export interface BotStateResponse {
  ok: boolean;
  state: {
    botId: string;
    status: string;
    scheduleActive?: boolean;
    lastEventAt?: string;
    lastPrice?: string;
    risk?: Record<string, unknown>;
  };
}

export interface ApiOrder {
  id: string;
  botId: string;
  venue: string;
  market: string;
  externalId?: string | null;
  clientOrderId?: string | null;
  side: "buy" | "sell";
  price: string;
  size: string;
  status: string;
  placedAt: string;
  updatedAt: string;
  meta?: Record<string, unknown> | null;
}

export interface ApiFill {
  id: string;
  orderId: string;
  venue: string;
  txSig: string;
  qty: string;
  price: string;
  fees?: string | null;
  realizedPnl?: string | null;
  filledAt: string;
  order?: {
    side: "buy" | "sell";
    market: string;
    venue: string;
  } | null;
}

export interface ApiEventLog {
  id: string;
  kind: string;
  ts: string;
  botId?: string | null;
  source: string;
  payload: Record<string, unknown>;
}

export interface ApiBotSnapshot {
  id: string;
  ts: string;
  equity?: string | null;
  pnlRealized?: string | null;
  pnlUnrealized?: string | null;
  state: Record<string, unknown>;
}

export interface ApiAccountBalance {
  mint: string;
  symbol?: string | null;
  amount: string;
  priceUsd?: string | null;
  usdValue?: string | null;
}

export interface ApiAccountSnapshot {
  id: string;
  walletId: string;
  ts: string;
  equity?: string | null;
  pnlRealized?: string | null;
  pnlUnrealized?: string | null;
  balances: ApiAccountBalance[];
}

export interface OrdersResponse {
  ok: boolean;
  orders: ApiOrder[];
}

export interface FillsResponse {
  ok: boolean;
  fills: ApiFill[];
}

export interface EventsResponse {
  ok: boolean;
  events: ApiEventLog[];
}

export interface SnapshotsResponse {
  ok: boolean;
  snapshots: ApiBotSnapshot[];
}

export interface AccountSnapshotsResponse {
  ok: boolean;
  snapshots: ApiAccountSnapshot[];
}

export interface AccountBalancesResponse {
  ok: boolean;
  snapshot: ApiAccountSnapshot;
}

export interface AccountFillsResponse {
  ok: boolean;
  fills: ApiFill[];
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

export interface PerpsRiskConfigResponse {
  ok: boolean;
  config: PerpsRiskConfig;
}

export interface PerpsPositionResponse {
  ok: boolean;
  position: {
    id: string;
    market: string;
    baseQty: string;
    quoteQty: string;
    entryPrice?: string | null;
    markPrice?: string | null;
    leverage?: string | null;
    liqPrice?: string | null;
    pnlUnrealized?: string | null;
    pnlRealized?: string | null;
    pnlFunding?: string | null;
    ts: string;
  };
}

export interface PerpsMarginResponse {
  ok: boolean;
  margin: {
    id: string;
    equity?: string | null;
    marginUsed?: string | null;
    healthRatio?: string | null;
    leverage?: string | null;
    ts: string;
  };
}

export interface CreateBotPayload {
  name: string;
  strategyKey: string;
  venue: string;
  market: string;
  config: Record<string, unknown>;
  riskConfig?: Record<string, unknown>;
  schedule?: Record<string, unknown> | null;
}

export interface UpdateBotPayload {
  name?: string;
  strategyKey?: string;
  venue?: string;
  market?: string;
  config?: Record<string, unknown>;
  riskConfig?: Record<string, unknown>;
  schedule?: Record<string, unknown> | null;
  cancelOpenOrders?: boolean;
}

export async function fetchBots() {
  return api<BotsResponse>("/bots");
}

export async function fetchBot(id: string) {
  return api<BotResponse>(`/bots/${id}`);
}

export async function fetchBotState(id: string) {
  return api<BotStateResponse>(`/bots/${id}/state`);
}

export async function createBot(payload: CreateBotPayload) {
  return api<BotResponse>("/bots", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateBot(botId: string, payload: UpdateBotPayload) {
  return api<BotResponse>(`/bots/${botId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function sendBotCommand(botId: string, action: string) {
  return api<{ ok: boolean }>(`/bots/${botId}/command`, {
    method: "POST",
    body: JSON.stringify({ action })
  });
}

export async function fetchBotOrders(botId: string, limit = 50) {
  return api<OrdersResponse>(`/bots/${botId}/orders?limit=${limit}`);
}

export async function fetchBotFills(botId: string, limit = 50) {
  return api<FillsResponse>(`/bots/${botId}/fills?limit=${limit}`);
}

export async function fetchBotEvents(botId: string, kind?: string, limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (kind) {
    params.set("kind", kind);
  }
  return api<EventsResponse>(`/bots/${botId}/events?${params.toString()}`);
}

export async function fetchBotSnapshots(botId: string, limit = 200) {
  return api<SnapshotsResponse>(`/bots/${botId}/snapshots?limit=${limit}`);
}

export async function fetchAccountSnapshots(params: { since?: string; until?: string; limit?: number } = {}) {
  const search = new URLSearchParams();
  if (params.since) {
    search.set("since", params.since);
  }
  if (params.until) {
    search.set("until", params.until);
  }
  if (params.limit) {
    search.set("limit", String(params.limit));
  }
  const query = search.toString();
  return api<AccountSnapshotsResponse>(`/account/snapshots${query ? `?${query}` : ""}`);
}

export async function fetchAccountBalances() {
  return api<AccountBalancesResponse>("/account/balances");
}

export async function fetchAccountFills(params: { since?: string; until?: string; limit?: number } = {}) {
  const search = new URLSearchParams();
  if (params.since) {
    search.set("since", params.since);
  }
  if (params.until) {
    search.set("until", params.until);
  }
  if (params.limit) {
    search.set("limit", String(params.limit));
  }
  const query = search.toString();
  return api<AccountFillsResponse>(`/account/fills${query ? `?${query}` : ""}`);
}

export async function fetchPerpsRiskConfig() {
  return api<PerpsRiskConfigResponse>("/perps/risk-config");
}

export async function updatePerpsRiskConfig(config: PerpsRiskConfig) {
  return api<PerpsRiskConfigResponse>("/perps/risk-config", {
    method: "PUT",
    body: JSON.stringify({ config })
  });
}

export async function fetchPerpsBotPosition(botId: string) {
  return api<PerpsPositionResponse>(`/perps/bots/${botId}/position`);
}

export async function fetchPerpsBotMargin(botId: string) {
  return api<PerpsMarginResponse>(`/perps/bots/${botId}/margin`);
}
