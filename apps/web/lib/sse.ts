const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export function createEventSource(botId?: string): EventSource {
  const base =
    API_URL.startsWith("http") ? API_URL : `${window.location.origin}${API_URL.startsWith("/") ? "" : "/"}${API_URL}`;
  const url = new URL(`${base}/events`);
  if (botId) {
    url.searchParams.set("botId", botId);
  }
  return new EventSource(url.toString());
}
