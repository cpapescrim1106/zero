"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchBots } from "../../../lib/api";

export default function BotsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["bots"],
    queryFn: fetchBots
  });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold">Bots</h3>
          <p className="text-sm text-muted">Create, pause, and inspect grid strategies.</p>
        </div>
        <Link
          href="/bots/new"
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white shadow-glow"
        >
          New Bot
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {isLoading && (
          <div className="rounded-xl border border-border bg-panel/80 p-6 text-sm text-muted">
            Loading bots...
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-border bg-panel/80 p-6 text-sm text-red-600">
            Failed to load bots.
          </div>
        )}
        {data?.bots?.map((bot) => (
          <Link
            key={bot.id}
            href={`/bots/${bot.id}`}
            className="group rounded-xl border border-border bg-panel/90 p-6 shadow-card transition hover:-translate-y-1"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">{bot.strategyKey}</p>
                <h4 className="mt-2 text-lg font-semibold text-text">{bot.name}</h4>
                <p className="mt-1 text-sm text-muted">
                  {bot.market} · {bot.venue}
                </p>
              </div>
              <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-text">
                {bot.status}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-muted">
              <span>Risk config ready</span>
              <span className="h-1 w-1 rounded-full bg-muted" />
              <span>Realtime SSE</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
