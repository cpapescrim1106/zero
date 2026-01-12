"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBots, sendBotCommand, type ApiBot } from "../../../lib/api";
import HealthBanner from "../../../components/ui/HealthBanner";
import MetricCard from "../../../components/ui/MetricCard";
import StatusChip from "../../../components/ui/StatusChip";
import type { HealthEvent } from "../../../lib/events";

export default function BotsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["bots"],
    queryFn: fetchBots
  });
  const { data: health = [] } = useQuery<HealthEvent[]>({
    queryKey: ["health"],
    queryFn: async () => [],
    initialData: []
  });

  const commandMutation = useMutation({
    mutationFn: ({ botId, action }: { botId: string; action: string }) =>
      sendBotCommand(botId, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
    }
  });

  const bots = data?.bots ?? [];
  const metrics = summarizeBots(bots);

  return (
    <section className="flex flex-col gap-6">
      <HealthBanner events={health.filter((event) => event.status !== "ok")} />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total bots" value={metrics.total} hint="Configured strategies" />
        <MetricCard label="Running" value={metrics.running} hint="Active execution" />
        <MetricCard label="Attention" value={metrics.attention} hint="Paused or error" />
      </div>

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

      <div className="overflow-hidden rounded-xl border border-border bg-panel/90 shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-[0.2em] text-muted">
            <tr>
              <th className="px-6 py-4">Bot</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Market</th>
              <th className="px-6 py-4">Strategy</th>
              <th className="px-6 py-4">Last update</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-6 py-6 text-muted">
                  Loading bots...
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={6} className="px-6 py-6 text-red-600">
                  Failed to load bots.
                </td>
              </tr>
            )}
            {bots.map((bot) => {
              const status = resolveStatus(bot);
              return (
                <tr key={bot.id} className="hover:bg-white/70">
                  <td className="px-6 py-4">
                    <Link href={`/bots/${bot.id}`} className="font-semibold text-text">
                      {bot.name}
                    </Link>
                    <p className="text-xs text-muted">{bot.venue}</p>
                  </td>
                  <td className="px-6 py-4">
                    <StatusChip label={status.label} tone={status.tone} />
                  </td>
                  <td className="px-6 py-4 text-sm text-muted">{bot.market}</td>
                  <td className="px-6 py-4 text-xs uppercase tracking-[0.2em] text-muted">
                    {bot.strategyKey}
                  </td>
                  <td className="px-6 py-4 text-xs text-muted">
                    {bot.runtime?.lastEventAt
                      ? formatRelative(bot.runtime.lastEventAt)
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {status.action === "start" && (
                        <ActionButton
                          label="Start"
                          onClick={() => commandMutation.mutate({ botId: bot.id, action: "start" })}
                        />
                      )}
                      {status.action === "pause" && (
                        <ActionButton
                          label="Pause"
                          onClick={() => commandMutation.mutate({ botId: bot.id, action: "pause" })}
                        />
                      )}
                      {status.action === "resume" && (
                        <ActionButton
                          label="Resume"
                          onClick={() => commandMutation.mutate({ botId: bot.id, action: "resume" })}
                        />
                      )}
                      <ActionButton
                        label="Stop"
                        tone="danger"
                        onClick={() => {
                          if (confirm(`Stop ${bot.name}? This cancels all orders.`)) {
                            commandMutation.mutate({ botId: bot.id, action: "stop" });
                          }
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function summarizeBots(bots: ApiBot[]) {
  const total = bots.length;
  const running = bots.filter((bot) => resolveStatus(bot).tone === "running").length;
  const attention = bots.filter((bot) => ["paused", "error"].includes(resolveStatus(bot).tone)).length;
  return {
    total: total.toString(),
    running: running.toString(),
    attention: attention.toString()
  };
}

function resolveStatus(bot: ApiBot) {
  const runtimeStatus = bot.runtime?.status;
  const status = runtimeStatus ?? bot.status;
  if (status === "running") {
    return { label: "Running", tone: "running", action: "pause" } as const;
  }
  if (status === "paused") {
    return { label: "Paused", tone: "paused", action: "resume" } as const;
  }
  if (status === "error") {
    return { label: "Error", tone: "error", action: "start" } as const;
  }
  return { label: "Stopped", tone: "stopped", action: "start" } as const;
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
