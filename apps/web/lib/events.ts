export type HealthStatus = "ok" | "degraded" | "down";

export interface BotEvent {
  kind: "bot";
  botId: string;
  status: "starting" | "running" | "paused" | "stopped" | "error";
  message?: string;
  ts: string;
}

export interface RiskEvent {
  kind: "risk";
  botId: string;
  reason: string;
  action: string;
  ts: string;
}

export interface HealthEvent {
  kind: "health";
  service: "api" | "web" | "market-data" | "bot-runner";
  status: HealthStatus;
  message?: string;
  ts: string;
}

export interface IntentEvent {
  kind: "intent";
  botId: string;
  ts: string;
  intent: unknown;
}

export type NormalizedEvent = BotEvent | RiskEvent | HealthEvent | IntentEvent;

export interface EventEnvelope {
  version: "v1";
  ts: string;
  kind: string;
  data: NormalizedEvent;
}

export interface EventPayload {
  channel: string;
  message: unknown;
}

export function extractEvent(payload: EventPayload): NormalizedEvent | null {
  if (!payload || typeof payload.message !== "object" || payload.message === null) {
    return null;
  }
  const envelope = payload.message as EventEnvelope;
  if (!envelope?.data || envelope.version !== "v1") {
    return null;
  }
  return envelope.data;
}
