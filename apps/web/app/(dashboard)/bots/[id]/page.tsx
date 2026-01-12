"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchBot } from "../../../../lib/api";
import { createEventSource, type EventPayload } from "../../../../lib/sse";

export default function BotDetailPage({ params }: { params: { id: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ["bot", params.id],
    queryFn: () => fetchBot(params.id)
  });
  const [latest, setLatest] = useState<EventPayload | null>(null);

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

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-panel/90 p-6 shadow-card">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{bot.strategyKey}</p>
          <h3 className="mt-2 text-2xl font-semibold">{bot.name}</h3>
          <p className="mt-1 text-sm text-muted">
            {bot.market} · {bot.venue}
          </p>
        </div>
        <div className="rounded-full border border-border px-4 py-2 text-xs font-semibold">
          {bot.status}
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
          <p className="text-sm text-muted">Hard stops + defensive ladder status.</p>
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
  return (
    <div className="h-40 rounded-xl border border-dashed border-border bg-white/60" />
  );
}
