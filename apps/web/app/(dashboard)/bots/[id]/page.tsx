"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchBot, fetchBotState, sendBotCommand } from "../../../../lib/api";
import { createEventSource } from "../../../../lib/sse";
import { useEffect, useMemo, useState } from "react";
import StatusChip from "../../../../components/ui/StatusChip";
import type { EventPayload, NormalizedEvent, RiskEvent } from "../../../../lib/events";

export default function BotDetailPage({ params }: { params: { id: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ["bot", params.id],
    queryFn: () => fetchBot(params.id)
  });
  const { data: state } = useQuery({
    queryKey: ["botState", params.id],
    queryFn: () => fetchBotState(params.id),
    refetchInterval: 15000
  });
  const [latest, setLatest] = useState<EventPayload | null>(null);

  const commandMutation = useMutation({
    mutationFn: (action: string) => sendBotCommand(params.id, action)
  });

  useEffect(() => {
    const source = createEventSource(params.id);
    source.onmessage = (event) => {
      try {
        setLatest(JSON.parse(event.data) as EventPayload);
      } catch {
        setLatest({ channel: "unknown", message: event.data });
      }
    };
    return () => source.close();
  }, [params.id]);

  const events = useQuery<NormalizedEvent[]>({
    queryKey: ["botEvents", params.id],
    queryFn: async () => [],
    initialData: []
  }).data;

  const riskEvents = useMemo(
    () => events.filter((event) => event.kind === "risk") as RiskEvent[],
    [events]
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-panel/90 p-6">Loading bot...</div>
    );
  }

  const bot = data?.bot;
  if (!bot) {
    return (
      <div className="rounded-xl border border-border bg-panel/90 p-6">Bot not found.</div>
    );
  }

  const status = bot.runtime?.status ?? bot.status;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-panel/90 p-6 shadow-card">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{bot.strategyKey}</p>
          <h3 className="mt-2 text-2xl font-semibold">{bot.name}</h3>
          <p className="mt-1 text-sm text-muted">
            {bot.market} · {bot.venue}
          </p>
          {state?.state?.scheduleActive === false ? (
            <p className="mt-2 text-xs text-muted">Scheduled window inactive.</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-3">
          <StatusChip
            label={status}
            tone={status === "running" ? "running" : status === "paused" ? "paused" : "stopped"}
          />
          <div className="flex gap-2">
            <ActionButton label="Start" onClick={() => commandMutation.mutate("start")} />
            <ActionButton label="Pause" onClick={() => commandMutation.mutate("pause")} />
            <ActionButton label="Resume" onClick={() => commandMutation.mutate("resume")} />
            <ActionButton label="Stop" tone="danger" onClick={() => commandMutation.mutate("stop")} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Equity curve">
          <PlaceholderChart />
        </Card>
        <Card title="Inventory">
          <PlaceholderChart />
        </Card>
        <Card title="Risk state">
          {riskEvents.length === 0 ? (
            <p className="text-sm text-muted">No risk events yet.</p>
          ) : (
            <ul className="space-y-3 text-xs text-muted">
              {riskEvents.slice(0, 4).map((event) => (
                <li key={`${event.ts}-${event.reason}`} className="rounded-lg border border-border bg-white/60 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">{event.reason}</p>
                  <p className="mt-1 text-sm text-text">Action: {event.action}</p>
                  <p className="mt-1 text-[11px] text-muted">{formatRelative(event.ts)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Price + grid bands">
          <PlaceholderChart />
        </Card>
        <Card title="Latest event">
          <pre className="max-h-64 overflow-auto rounded-lg bg-black/5 p-4 text-xs">
            {latest ? JSON.stringify(latest, null, 2) : "No events yet."}
          </pre>
        </Card>
      </div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-panel/90 p-5 shadow-card">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function PlaceholderChart() {
  return <div className="h-40 rounded-xl border border-dashed border-border bg-white/60" />;
}

function ActionButton({
  label,
  tone = "default",
  onClick
}: {
  label: string;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  const className =
    tone === "danger"
      ? "rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
      : "rounded-full border border-border bg-white/70 px-3 py-1 text-xs font-semibold text-text";
  return (
    <button type="button" onClick={onClick} className={className}>
      {label}
    </button>
  );
}

function formatRelative(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
