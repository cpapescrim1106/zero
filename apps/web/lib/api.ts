const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
}

export interface BotsResponse {
  ok: boolean;
  bots: ApiBot[];
}

export interface BotResponse {
  ok: boolean;
  bot: ApiBot;
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

export async function fetchBots() {
  return api<BotsResponse>("/bots");
}

export async function fetchBot(id: string) {
  return api<BotResponse>(`/bots/${id}`);
}

export async function createBot(payload: CreateBotPayload) {
  return api<BotResponse>("/bots", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
