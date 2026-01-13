"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  fetchBot,
  fetchBotEvents,
  fetchBotFills,
  fetchBotOrders,
  fetchBotSnapshots,
  fetchBotState,
  fetchPerpsBotMargin,
  fetchPerpsBotPosition,
  sendBotCommand
} from "../../../../lib/api";
import { createEventSource } from "../../../../lib/sse";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StatusChip from "../../../../components/ui/StatusChip";
import type { EventPayload, RiskEvent } from "../../../../lib/events";
import LineChart from "../../../../components/charts/LineChart";

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
  const { data: ordersData } = useQuery({
    queryKey: ["botOrders", params.id],
    queryFn: () => fetchBotOrders(params.id),
    refetchInterval: 15000
  });
  const { data: fillsData } = useQuery({
    queryKey: ["botFills", params.id],
    queryFn: () => fetchBotFills(params.id),
    refetchInterval: 15000
  });
  const { data: eventsData } = useQuery({
    queryKey: ["botEvents", params.id],
    queryFn: () => fetchBotEvents(params.id, "risk")
  });
  const { data: snapshotData } = useQuery({
    queryKey: ["botSnapshots", params.id],
    queryFn: () => fetchBotSnapshots(params.id, 300),
    refetchInterval: 30000
  });
  const isPerps = data?.bot ? isPerpsBot(data.bot) : false;
  const { data: perpsPositionData } = useQuery({
    queryKey: ["perpsPosition", params.id],
    queryFn: () => fetchPerpsBotPosition(params.id),
    enabled: isPerps,
    retry: false,
    refetchInterval: 15000
  });
  const { data: perpsMarginData } = useQuery({
    queryKey: ["perpsMargin", params.id],
    queryFn: () => fetchPerpsBotMargin(params.id),
    enabled: isPerps,
    retry: false,
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

  const riskEvents = useMemo(
    () => (eventsData?.events ?? []).map((event) => event.payload as unknown).filter(isRiskEvent),
    [eventsData]
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
  const orders = ordersData?.orders ?? [];
  const rejectedOrders = orders.filter((order) => order.status === "rejected");
  const lastRejected = rejectedOrders[0];
  const lastError =
    lastRejected && lastRejected.meta && typeof lastRejected.meta.error === "string" ? lastRejected.meta.error : null;
  const lastErrorShort = lastError ? shortenError(lastError) : null;
  const snapshots = snapshotData?.snapshots ?? [];
  const equitySeries = snapshots
    .filter((snapshot) => snapshot.equity)
    .map((snapshot) => ({
      time: toTimestamp(snapshot.ts),
      value: Number(snapshot.equity)
    }));
  const inventorySeries = snapshots.flatMap((snapshot) => {
    const base = readStateNumber(snapshot.state, "inventoryBase");
    if (base === null) {
      return [];
    }
    return [{ time: toTimestamp(snapshot.ts), value: base }];
  });
  const priceSeries = snapshots.flatMap((snapshot) => {
    const price = readStateNumber(snapshot.state, "lastPrice");
    if (price === null) {
      return [];
    }
    return [{ time: toTimestamp(snapshot.ts), value: price }];
  });
  const rangeLines = getRangeLines(bot.config);

  const lastPrice = state?.state?.lastPrice ?? "—";
  const riskStatus = readRiskStatus(state?.state?.risk);
  const perpsPosition = perpsPositionData?.position;
  const perpsMargin = perpsMarginData?.margin;
  const liqDistance = computeLiqDistance(perpsPosition?.markPrice, perpsPosition?.liqPrice);
  const perpsGrid = summarizePerpsGrid(bot.config);

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
            <Link
              href={`/bots/${params.id}/edit`}
              className="rounded-full border border-border bg-white/70 px-3 py-1 text-xs font-semibold text-text"
            >
              Edit
            </Link>
            <ActionButton label="Start" onClick={() => commandMutation.mutate("start")} />
            <ActionButton label="Pause" onClick={() => commandMutation.mutate("pause")} />
            <ActionButton label="Resume" onClick={() => commandMutation.mutate("resume")} />
            <ActionButton label="Stop" tone="danger" onClick={() => commandMutation.mutate("stop")} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Last update" value={state?.state?.lastEventAt ? formatRelative(state.state.lastEventAt) : "—"} />
        <SummaryCard label="Open orders" value={orders.length.toString()} />
        <SummaryCard label="Last price" value={lastPrice} />
        <SummaryCard label="Rejected" value={rejectedOrders.length.toString()} />
        <SummaryCard label="Risk mode" value={riskStatus} />
        <SummaryCard label="Last error" value={lastErrorShort ?? "None"} title={lastError ?? undefined} />
      </div>

      {isPerps && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <SummaryCard label="Position size" value={perpsPosition?.baseQty ?? "—"} />
            <SummaryCard label="Entry price" value={perpsPosition?.entryPrice ?? "—"} />
            <SummaryCard label="Mark price" value={perpsPosition?.markPrice ?? "—"} />
            <SummaryCard label="Leverage" value={perpsMargin?.leverage ?? perpsPosition?.leverage ?? "—"} />
            <SummaryCard label="Liq price" value={perpsPosition?.liqPrice ?? "—"} />
            <SummaryCard label="Liq distance" value={liqDistance ?? "—"} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="PnL (unrealized)" value={perpsPosition?.pnlUnrealized ?? "—"} />
            <SummaryCard label="PnL (realized)" value={perpsPosition?.pnlRealized ?? "—"} />
            <SummaryCard label="Funding PnL" value={perpsPosition?.pnlFunding ?? "—"} />
            <SummaryCard label="Equity" value={perpsMargin?.equity ?? "—"} />
            <SummaryCard label="Grid" value={perpsGrid ?? "—"} />
          </div>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Equity curve">
          {equitySeries.length === 0 ? <EmptyChart /> : <LineChart data={equitySeries} />}
        </Card>
        <Card title="Inventory">
          {inventorySeries.length === 0 ? <EmptyChart /> : <LineChart data={inventorySeries} color="#0f766e" />}
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
          {priceSeries.length === 0 ? <EmptyChart /> : <LineChart data={priceSeries} priceLines={rangeLines} />}
        </Card>
        <Card title="Latest event">
          <pre className="max-h-64 overflow-auto rounded-lg bg-black/5 p-4 text-xs">
            {latest ? JSON.stringify(latest, null, 2) : "No events yet."}
          </pre>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Open orders">
          <OrdersTable orders={orders} />
        </Card>
        <Card title="Recent fills">
          <FillsTable fills={fillsData?.fills ?? []} />
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

function SummaryCard({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel/90 p-4 shadow-card">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-text" title={title}>
        {value}
      </p>
    </div>
  );
}

function PlaceholderChart() {
  return <div className="h-40 rounded-xl border border-dashed border-border bg-white/60" />;
}

function EmptyChart() {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-white/60 text-xs text-muted">
      No snapshots yet.
    </div>
  );
}

function OrdersTable({
  orders
}: {
  orders: Array<{ id: string; side: string; price: string; size: string; status: string; updatedAt: string; meta?: Record<string, unknown> | null }>;
}) {
  if (orders.length === 0) {
    return <p className="text-sm text-muted">No orders yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white/70">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted">
          <tr>
            <th className="px-4 py-3">Order</th>
            <th className="px-4 py-3">Side</th>
            <th className="px-4 py-3">Price</th>
            <th className="px-4 py-3">Size</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.slice(0, 8).map((order) => (
            <tr key={order.id}>
              <td className="px-4 py-3 font-mono text-[11px] text-muted">{shortId(order.id)}</td>
              <td className="px-4 py-3 capitalize">{order.side}</td>
              <td className="px-4 py-3">{order.price}</td>
              <td className="px-4 py-3">{order.size}</td>
              <td className="px-4 py-3">
                <p className="capitalize">{order.status}</p>
                {order.status === "rejected" && order.meta && typeof order.meta.error === "string" ? (
                  <p className="mt-1 max-w-xs truncate text-[11px] text-rose-500" title={order.meta.error}>
                    {shortenError(order.meta.error)}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3 text-right text-muted">{formatRelative(order.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FillsTable({ fills }: { fills: Array<{ id: string; price: string; qty: string; filledAt: string; fees?: string | null; order?: { side?: string | null } | null }> }) {
  if (fills.length === 0) {
    return <p className="text-sm text-muted">No fills yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white/70">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted">
          <tr>
            <th className="px-4 py-3">Fill</th>
            <th className="px-4 py-3">Side</th>
            <th className="px-4 py-3">Price</th>
            <th className="px-4 py-3">Qty</th>
            <th className="px-4 py-3">Fee</th>
            <th className="px-4 py-3 text-right">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {fills.slice(0, 8).map((fill) => (
            <tr key={fill.id}>
              <td className="px-4 py-3 font-mono text-[11px] text-muted">{shortId(fill.id)}</td>
              <td className="px-4 py-3 capitalize">{fill.order?.side ?? "—"}</td>
              <td className="px-4 py-3">{fill.price}</td>
              <td className="px-4 py-3">{fill.qty}</td>
              <td className="px-4 py-3">{fill.fees ?? "—"}</td>
              <td className="px-4 py-3 text-right text-muted">{formatRelative(fill.filledAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isRiskEvent(payload: unknown): payload is RiskEvent {
  return typeof payload === "object" && payload !== null && (payload as { kind?: string }).kind === "risk";
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

function shortId(value: string) {
  return value.length > 10 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function shortenError(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("insufficient funds")) {
    return "Insufficient funds";
  }
  const firstSentence = value.split(". ")[0] ?? "";
  if (firstSentence.length > 80) {
    return `${firstSentence.slice(0, 77)}…`;
  }
  return firstSentence.length > 0 ? firstSentence : value.slice(0, 80);
}

function toTimestamp(value: string) {
  return Math.floor(new Date(value).getTime() / 1000) as unknown as import("lightweight-charts").UTCTimestamp;
}

function readStateNumber(state: Record<string, unknown>, key: string) {
  const raw = state?.[key];
  if (typeof raw === "number") {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readRiskStatus(risk?: Record<string, unknown>) {
  if (!risk || typeof risk !== "object") {
    return "—";
  }
  const status = (risk as { status?: unknown }).status;
  return typeof status === "string" ? status : "—";
}

function isPerpsBot(bot: { config: Record<string, unknown>; venue: string }) {
  const kind = (bot.config as { kind?: string }).kind ?? (bot.venue === "drift_perps" ? "drift_perps" : "spot");
  return kind === "drift_perps";
}

function computeLiqDistance(mark?: string, liq?: string) {
  if (!mark || !liq) {
    return null;
  }
  const markNum = Number(mark);
  const liqNum = Number(liq);
  if (!Number.isFinite(markNum) || !Number.isFinite(liqNum) || markNum === 0) {
    return null;
  }
  const distance = Math.abs((markNum - liqNum) / markNum) * 100;
  return `${distance.toFixed(2)}%`;
}

function summarizePerpsGrid(config: Record<string, unknown>) {
  const perps = (config as { perps?: Record<string, unknown> }).perps ?? {};
  const strategy = (perps as { strategy?: string }).strategy;
  const simple = (perps as { simpleGrid?: Record<string, unknown> }).simpleGrid ?? {};
  const curve = (perps as { curveGrid?: Record<string, unknown> }).curveGrid ?? {};
  if (strategy === "curve_grid" || Object.keys(curve).length > 0) {
    const levels = curve.levels ? Number(curve.levels) : null;
    const step = curve.stepPercent ? Number(curve.stepPercent) : null;
    const bias = typeof curve.bias === "string" ? curve.bias : "neutral";
    const parts = [
      "curve",
      levels ? `${levels} lvls` : null,
      step ? `${step}%` : null,
      bias ? `(${bias})` : null
    ].filter(Boolean);
    return parts.join(" ");
  }
  if (Object.keys(simple).length > 0) {
    const lower = simple.lowerPrice ? String(simple.lowerPrice) : null;
    const upper = simple.upperPrice ? String(simple.upperPrice) : null;
    const count = simple.gridCount ? String(simple.gridCount) : null;
    const parts = ["simple", count ? `${count} lvls` : null, lower && upper ? `${lower}-${upper}` : null].filter(Boolean);
    return parts.join(" ");
  }
  return null;
}

function getRangeLines(config: Record<string, unknown>) {
  const rangeLow = readStateNumber(config, "rangeLow");
  const rangeHigh = readStateNumber(config, "rangeHigh");
  const lines: Array<{ price: number; title: string; color: string }> = [];
  if (rangeLow !== null) {
    lines.push({ price: rangeLow, title: "Low", color: "rgba(244, 63, 94, 0.5)" });
  }
  if (rangeHigh !== null) {
    lines.push({ price: rangeHigh, title: "High", color: "rgba(59, 130, 246, 0.5)" });
  }
  return lines;
}
