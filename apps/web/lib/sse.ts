const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface EventPayload {
  channel: string;
  message: unknown;
}

export function createEventSource(botId?: string): EventSource {
  const url = new URL(`${API_URL}/events`);
  if (botId) {
    url.searchParams.set("botId", botId);
  }
  return new EventSource(url.toString());
}
