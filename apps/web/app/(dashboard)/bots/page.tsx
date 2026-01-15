"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchBotFills,
  fetchBotOrders,
  fetchBotState,
  fetchBots,
  sendBotCommand,
  type ApiBot,
  type ApiFill,
  type ApiOrder
} from "../../../lib/api";
import GridLevelsChart from "../../../components/GridLevelsChart";
import { formatPrice, formatQty, formatTimeAgo } from "../../../lib/format";

const ACTIONS = ["start", "pause", "resume", "stop"] as const;

type Action = (typeof ACTIONS)[number] | "reduce";

type BotStatusTone = "running" | "paused" | "stopped" | "error";

export default function BotsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["bots"],
    queryFn: fetchBots,
    refetchInterval: 15000
  });

  const bots = data?.bots ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(bots[0]?.id ?? null);
  const [reduceOnly, setReduceOnly] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!selectedId && bots[0]) {
      setSelectedId(bots[0].id);
    }
  }, [bots, selectedId]);

  const selectedBot = bots.find((bot) => bot.id === selectedId) ?? bots[0];

  const { data: ordersData } = useQuery({
    queryKey: ["botOrders", selectedId],
    queryFn: () => fetchBotOrders(selectedId as string, 80),
    enabled: Boolean(selectedId),
    refetchInterval: 10000
  });

  const { data: fillsData } = useQuery({
    queryKey: ["botFills", selectedId],
    queryFn: () => fetchBotFills(selectedId as string, 50),
    enabled: Boolean(selectedId),
    refetchInterval: 10000
  });

  const { data: botStateData } = useQuery({
    queryKey: ["botState", selectedId],
    queryFn: () => fetchBotState(selectedId as string),
    enabled: Boolean(selectedId),
    refetchInterval: 5000
  });

  const commandMutation = useMutation({
    mutationFn: ({ botId, action }: { botId: string; action: string }) => sendBotCommand(botId, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bots"] });
    }
  });

  const orders = ordersData?.orders ?? [];
  const openOrders = orders.filter((order) => ["new", "open", "partial"].includes(order.status));
  const fills = fillsData?.fills ?? [];
  const filledOrders = orders.filter((order) => order.status === "filled");
  const placedOrders = orders.filter((order) => order.status !== "rejected");
  const orderLevels = openOrders
    .map((order) => ({
      price: Number(order.price),
      size: Number(order.size),
      side: order.side
    }))
    .filter((order) => Number.isFinite(order.price) && Number.isFinite(order.size));

  const counts = useMemo(() => {
    const running = bots.filter((bot) => resolveStatus(bot).tone === "running").length;
    const paused = bots.filter((bot) => resolveStatus(bot).tone === "paused").length;
    const error = bots.filter((bot) => resolveStatus(bot).tone === "error").length;
    return { running, paused, error };
  }, [bots]);

  const gridCount = selectedBot ? readGridCount(selectedBot.config) : null;
  const lastPrice = readNumber(botStateData?.state?.lastPrice);
  const lastFill = fills[0];
  const pnlRealized = readNumber(botStateData?.state?.pnlRealized);
  const pnlUnrealized = readNumber(botStateData?.state?.pnlUnrealized);
  const equity = readNumber(botStateData?.state?.equity);
  const startNav = readNumber(botStateData?.state?.startNav);
  const startPrice = readNumber(botStateData?.state?.startPrice);
  const netPnl = computeNetPnl(pnlRealized, pnlUnrealized);
  const roi = computeRoi(netPnl, startNav);
  const bhSolNav = computeBenchmarkNav(startNav, startPrice, lastPrice);
  const alphaSol = computeAlpha(equity, bhSolNav);
  const totalFees = sumFees(fills);
  const fillRate = placedOrders.length > 0 ? filledOrders.length / placedOrders.length : null;
  const gridHealthLabel = formatGridHealth(openOrders.length, gridCount);
  const inventorySkew = formatInventorySkew(
    readNumber(botStateData?.state?.inventoryBase),
    readNumber(botStateData?.state?.inventoryQuote),
    lastPrice
  );
  const [rangeSeconds, setRangeSeconds] = useState<number | null>(300);
  const [priceHistory, setPriceHistory] = useState<Array<{ time: import("lightweight-charts").UTCTimestamp; value: number }>>([]);
  const lastPriceRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const pythActiveRef = useRef(false);

  const fillSeries = useMemo(() => {
    return fills
      .map((fill) => ({
        time: Math.floor(new Date(fill.filledAt).getTime() / 1000) as import("lightweight-charts").UTCTimestamp,
        value: Number(fill.price)
      }))
      .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.time))
      .sort((a, b) => Number(a.time) - Number(b.time))
      .slice(-120);
  }, [fills]);

  useEffect(() => {
    setPriceHistory([]);
    lastPriceRef.current = null;
    lastTimeRef.current = 0;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    setPriceHistory((prev) => mergePriceSeries(fillSeries, prev));
  }, [fillSeries, selectedId]);

  useEffect(() => {
    if (!selectedId || lastPrice === null) {
      return;
    }
    if (pythActiveRef.current) {
      return;
    }
    if (lastPriceRef.current !== null && lastPriceRef.current === lastPrice) {
      return;
    }
    lastPriceRef.current = lastPrice;
    setPriceHistory((prev) => {
      const now = Math.floor(Date.now() / 1000);
      const nextTime = now <= lastTimeRef.current ? lastTimeRef.current + 1 : now;
      lastTimeRef.current = nextTime;
      const time = nextTime as import("lightweight-charts").UTCTimestamp;
      const next = [...prev, { time, value: lastPrice }];
      return next.slice(-120);
    });
  }, [lastPrice, selectedId]);

  useEffect(() => {
    if (!selectedBot) {
      return;
    }
    const baseSymbol = getBaseSymbol(selectedBot.market);
    if (!baseSymbol) {
      return;
    }
    let active = true;
    let socket: WebSocket | null = null;
    const controller = new AbortController();
    pythActiveRef.current = false;
    let lastPublishTime = 0;
    let lastPriceValue = 0;

    const feedQuery = `Crypto.${baseSymbol.toUpperCase()}/USD`;
    const lookupUrl = `https://hermes.pyth.network/v2/price_feeds?query=${encodeURIComponent(feedQuery)}`;

    fetch(lookupUrl, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!active) {
          return;
        }
        const feedId = Array.isArray(data) ? data[0]?.id : null;
        if (!feedId) {
          return;
        }
        socket = new WebSocket("wss://hermes.pyth.network/ws");
        socket.onopen = () => {
          socket?.send(JSON.stringify({ type: "subscribe", ids: [feedId], verbose: true }));
        };
        socket.onmessage = (event) => {
          if (!active) {
            return;
          }
          let payload: any;
          try {
            payload = JSON.parse(event.data as string);
          } catch {
            return;
          }
          if (payload?.type !== "price_update") {
            return;
          }
          const price = payload?.price_feed?.price?.price;
          const expo = payload?.price_feed?.price?.expo;
          const publishTime = payload?.price_feed?.price?.publish_time;
          if (price === undefined || expo === undefined || publishTime === undefined) {
            return;
          }
          const numericPrice = Number(price) * Math.pow(10, Number(expo));
          if (!Number.isFinite(numericPrice)) {
            return;
          }
          if (publishTime === lastPublishTime && numericPrice === lastPriceValue) {
            return;
          }
          lastPublishTime = publishTime;
          lastPriceValue = numericPrice;
          pythActiveRef.current = true;
          const time = Number(publishTime) as import("lightweight-charts").UTCTimestamp;
          setPriceHistory((prev) => mergePriceSeries([{ time, value: numericPrice }], prev));
        };
      })
      .catch(() => {});

    return () => {
      active = false;
      controller.abort();
      if (socket) {
        socket.close();
      }
    };
  }, [selectedBot]);
  const lastEventMessage = lastFill
    ? `${selectedBot?.name ?? ""} ${lastFill.order?.side ?? "fill"} ${formatQty(Number(lastFill.qty))} @ ${formatPrice(Number(lastFill.price))}`
    : selectedBot?.runtime?.message ?? "Idle";

  const handleAction = (botId: string, action: Action) => {
    if (action === "reduce") {
      setReduceOnly((prev) => ({ ...prev, [botId]: !prev[botId] }));
      return;
    }
    commandMutation.mutate({ botId, action });
  };

  return (
    <section className="flex h-full flex-col">
      <div className="flex h-7 items-center justify-between border border-border bg-panel/85 px-2 text-[11px] uppercase tracking-[0.2em] text-muted">
        <div className="flex items-center gap-4">
          <span>running {counts.running}</span>
          <span>paused {counts.paused}</span>
          <span>error {counts.error}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] normal-case text-muted">
          <span className="uppercase tracking-[0.2em]">last</span>
          <span>{lastEventMessage}</span>
        </div>
      </div>

      <div className="grid flex-1 min-h-0 grid-cols-[1.35fr_0.8fr_0.85fr] gap-2 pt-2">
        <div className="flex h-full flex-col rounded border border-border bg-panel/80">
          <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted">Bot table</div>
            <div className="text-[11px] text-muted">{bots.length} bots</div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 border-b border-border bg-panel/95 text-[10px] uppercase tracking-[0.2em] text-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left">Bot</th>
                  <th className="px-2 py-1.5 text-left">Status</th>
                  <th className="px-2 py-1.5 text-left">Market</th>
                  <th className="px-2 py-1.5 text-left">Strategy</th>
                  <th className="px-2 py-1.5 text-right">PnL</th>
                  <th className="px-2 py-1.5 text-right">Equity</th>
                  <th className="px-2 py-1.5 text-right">Updated</th>
                  <th className="px-2 py-1.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-3 text-muted">
                      Loading bots...
                    </td>
                  </tr>
                ) : bots.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-3 text-muted">
                      No bots yet.
                    </td>
                  </tr>
                ) : (
                  bots.map((bot) => {
                    const status = resolveStatus(bot);
                    const primaryLabel =
                      status.action === "pause" ? "Pause" : status.action === "resume" ? "Resume" : "Start";
                    const runtimePnl = computeNetPnl(
                      readNumber(bot.runtime?.pnlRealized),
                      readNumber(bot.runtime?.pnlUnrealized)
                    );
                    const runtimeEquity = readNumber(bot.runtime?.equity);
                    const selected = bot.id === selectedId;
                    return (
                      <tr
                        key={bot.id}
                        className={`h-8 cursor-pointer ${selected ? "bg-white/70" : "hover:bg-white/60"}`}
                        onClick={() => setSelectedId(bot.id)}
                      >
                        <td className="px-2 py-1.5">
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-text">{bot.name}</span>
                            <span className="text-[10px] uppercase tracking-[0.2em] text-muted">{bot.venue}</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <StatusPill tone={status.tone} label={status.label} />
                        </td>
                        <td className="px-2 py-1.5 text-[11px] text-muted">{bot.market}</td>
                        <td className="px-2 py-1.5 text-[10px] uppercase tracking-[0.2em] text-muted">
                          {bot.strategyKey}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[11px] text-muted">
                          {formatUsd(runtimePnl)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[11px] text-muted">
                          {formatUsd(runtimeEquity)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[11px] text-muted">
                          {bot.runtime?.lastEventAt ? formatTimeAgo(bot.runtime.lastEventAt) : "-"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <div className="flex justify-end gap-1">
                            <IconActionButton
                              label={primaryLabel}
                              icon={status.action === "pause" ? "⏸" : status.action === "resume" ? "▶" : "▶"}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleAction(bot.id, status.action);
                              }}
                            />
                            <IconActionButton
                              label="Stop"
                              icon="■"
                              tone="danger"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleAction(bot.id, "stop");
                              }}
                            />
                            <IconActionButton
                              label={reduceOnly[bot.id] ? "Reduce (active)" : "Reduce"}
                              icon="↓"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleAction(bot.id, "reduce");
                              }}
                            />
                            <Link
                              href={`/bots/${bot.id}/edit`}
                              title="Edit"
                              className="flex h-6 w-6 items-center justify-center rounded border border-border bg-white/70 text-[11px] font-semibold text-text"
                              onClick={(event) => event.stopPropagation()}
                            >
                              ✎
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex h-full flex-col rounded border border-border bg-panel/80 p-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Grid levels</p>
            <div className="flex items-center gap-1 text-[10px] text-muted">
              <ChartRangeButton label="1m" active={rangeSeconds === 60} onClick={() => setRangeSeconds(60)} />
              <ChartRangeButton label="5m" active={rangeSeconds === 300} onClick={() => setRangeSeconds(300)} />
              <ChartRangeButton label="15m" active={rangeSeconds === 900} onClick={() => setRangeSeconds(900)} />
              <ChartRangeButton label="All" active={rangeSeconds === null} onClick={() => setRangeSeconds(null)} />
            </div>
          </div>
          {selectedBot ? (
            orderLevels.length > 0 ? (
              <GridLevelsChart
                orders={orderLevels}
                midPrice={lastPrice ?? orderLevels[Math.floor(orderLevels.length / 2)]?.price}
                priceSeries={priceHistory}
                height={620}
                rangeSeconds={rangeSeconds}
                showTimeScale
                rightOffset={6}
                barSpacing={7}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center rounded border border-border bg-white/60 text-[11px] text-muted">
                No open orders.
              </div>
            )
          ) : (
            <div className="text-sm text-muted">No bot selected.</div>
          )}
          {lastFill ? (
            <div className="mt-2 text-[11px] text-muted">
              Last fill {lastFill.order?.side ?? "fill"} @ {formatPrice(Number(lastFill.price))}
            </div>
          ) : null}
        </div>

        <div className="flex h-full flex-col gap-2 rounded border border-border bg-panel/80 p-2">
          {selectedBot ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Focus</p>
                  <h3 className="text-base font-semibold text-text">{selectedBot.name}</h3>
                  <p className="text-[11px] text-muted">
                    {selectedBot.market} • {selectedBot.venue} • {selectedBot.strategyKey}
                  </p>
                </div>
                <StatusPill tone={resolveStatus(selectedBot).tone} label={resolveStatus(selectedBot).label} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <MetricTile label="Bot NAV" value={formatUsd(equity)} />
                <MetricTile label="P&L" value={formatUsd(netPnl)} />
                <MetricTile label="ROI" value={formatPercent(roi)} />
                <MetricTile label="Alpha vs SOL" value={formatUsd(alphaSol)} />
                <MetricTile label="Grid Profit" value={formatUsd(pnlRealized)} />
                <MetricTile label="Floating P&L" value={formatUsd(pnlUnrealized)} />
              </div>

              <div className="text-[10px] text-muted">
                <span className="uppercase tracking-[0.2em]">Grid health</span>
                <span className="ml-2">{gridHealthLabel}</span>
                {inventorySkew ? <span className="ml-2">• Skew {inventorySkew}</span> : null}
                {fillRate !== null ? <span className="ml-2">• Fill {formatPercent(fillRate)}</span> : null}
                {totalFees !== null ? <span className="ml-2">• Fees {formatUsd(totalFees)}</span> : null}
              </div>

              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-muted">Open orders</p>
                <OrdersSplitTable orders={openOrders} />
              </div>

              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-muted">Recent fills</p>
                <FillsTable fills={fills} />
              </div>
            </>
          ) : (
            <div className="text-sm text-muted">Select a bot.</div>
          )}
        </div>
      </div>
    </section>
  );
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

function StatusPill({ label, tone }: { label: string; tone: BotStatusTone }) {
  const toneClass =
    tone === "running"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "paused"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${toneClass}`}>
      {label}
    </span>
  );
}

function IconActionButton({
  label,
  icon,
  tone = "default",
  onClick
}: {
  label: string;
  icon: string;
  tone?: "default" | "danger";
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const className =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-border bg-white/70 text-text";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-6 w-6 items-center justify-center rounded border text-[11px] font-semibold ${className}`}
    >
      {icon}
    </button>
  );
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="text-xs font-semibold text-text">{value}</p>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded border border-border bg-white/70 px-2 py-1">
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted">{label}</span>
      <span className="text-xs font-semibold text-text">{value}</span>
    </div>
  );
}

function ChartRangeButton({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
        active ? "border-slate-300 bg-white/80 text-text" : "border-border bg-white/60 text-muted"
      }`}
    >
      {label}
    </button>
  );
}

function OrdersSplitTable({ orders }: { orders: ApiOrder[] }) {
  if (orders.length === 0) {
    return <p className="text-[11px] text-muted">No orders.</p>;
  }
  const buys = orders
    .filter((order) => order.side === "buy")
    .sort((a, b) => Number(b.price) - Number(a.price));
  const sells = orders
    .filter((order) => order.side === "sell")
    .sort((a, b) => Number(a.price) - Number(b.price));
  const maxRows = Math.max(buys.length, sells.length);
  return (
    <div className="overflow-hidden rounded border border-border bg-white/70">
      <div className="grid grid-cols-2 divide-x divide-border">
        <div>
          <div className="border-b border-border px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-700">Buys</div>
          <table className="w-full text-left text-[11px]">
            <thead className="sr-only">
              <tr>
                <th>Price</th>
                <th>Size</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from({ length: maxRows }).map((_, idx) => {
                const order = buys[idx];
                if (!order) {
                  return (
                    <tr key={`buy-empty-${idx}`}>
                      <td className="px-2 py-1 text-muted">—</td>
                      <td className="px-2 py-1 text-right text-muted">—</td>
                      <td className="px-2 py-1 text-right text-muted">—</td>
                    </tr>
                  );
                }
                return (
                  <tr key={order.id}>
                    <td className="px-2 py-1">{formatFixedPrice(order.price)}</td>
                    <td className="px-2 py-1 text-right">{formatQty(Number(order.size))}</td>
                    <td className="px-2 py-1 text-right text-muted">{order.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <div className="border-b border-border px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-rose-600">Sells</div>
          <table className="w-full text-left text-[11px]">
            <thead className="sr-only">
              <tr>
                <th>Price</th>
                <th>Size</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from({ length: maxRows }).map((_, idx) => {
                const order = sells[idx];
                if (!order) {
                  return (
                    <tr key={`sell-empty-${idx}`}>
                      <td className="px-2 py-1 text-muted">—</td>
                      <td className="px-2 py-1 text-right text-muted">—</td>
                      <td className="px-2 py-1 text-right text-muted">—</td>
                    </tr>
                  );
                }
                return (
                  <tr key={order.id}>
                    <td className="px-2 py-1">{formatFixedPrice(order.price)}</td>
                    <td className="px-2 py-1 text-right">{formatQty(Number(order.size))}</td>
                    <td className="px-2 py-1 text-right text-muted">{order.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatFixedPrice(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return "—";
  }
  return parsed.toFixed(2);
}

function FillsTable({ fills }: { fills: ApiFill[] }) {
  if (fills.length === 0) {
    return <p className="text-[11px] text-muted">No fills.</p>;
  }
  return (
    <div className="overflow-hidden rounded border border-border bg-white/70">
      <table className="w-full text-left text-[11px]">
        <thead className="border-b border-border text-[10px] uppercase tracking-[0.18em] text-muted">
          <tr>
            <th className="px-2 py-1">Side</th>
            <th className="px-2 py-1">Price</th>
            <th className="px-2 py-1 text-right">Qty</th>
            <th className="px-2 py-1 text-right">Age</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {fills.slice(0, 8).map((fill) => (
            <tr key={fill.id}>
              <td className="px-2 py-1 capitalize text-muted">{fill.order?.side ?? "-"}</td>
              <td className="px-2 py-1">{formatPrice(Number(fill.price))}</td>
              <td className="px-2 py-1 text-right">{formatQty(Number(fill.qty))}</td>
              <td className="px-2 py-1 text-right text-muted">{formatTimeAgo(fill.filledAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function readGridCount(config: Record<string, unknown>) {
  const root = config as Record<string, unknown>;
  const grid = readRecord(root.grid);
  const gridCount = readNumber(grid?.gridCount ?? root.gridCount);
  if (gridCount !== null) {
    return gridCount;
  }
  const marketMaker = readRecord(root.marketMaker);
  const makerLevels = readNumber(marketMaker?.levels);
  if (makerLevels !== null) {
    return makerLevels;
  }
  const perps = readRecord(root.perps);
  const simplePerps = readRecord(perps?.simpleGrid);
  const curvePerps = readRecord(perps?.curveGrid);
  const perpsCount = readNumber(simplePerps?.gridCount ?? curvePerps?.levels);
  if (perpsCount !== null) {
    return perpsCount;
  }
  return null;
}

function readRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatGridCount(openOrders: number, gridCount: number | null) {
  if (gridCount === null) {
    return `${openOrders} / —`;
  }
  return `${openOrders} / ${gridCount}`;
}

function computeNetPnl(realized: number | null, unrealized: number | null) {
  if (realized === null && unrealized === null) {
    return null;
  }
  return (realized ?? 0) + (unrealized ?? 0);
}

function computeRoi(netPnl: number | null, startNav: number | null) {
  if (netPnl === null || startNav === null) {
    return null;
  }
  if (!Number.isFinite(startNav) || startNav <= 0) {
    return null;
  }
  return netPnl / startNav;
}

function sumFees(fills: ApiFill[]) {
  const total = fills.reduce((sum, fill) => {
    const fee = readNumber(fill.fees);
    return fee === null ? sum : sum + fee;
  }, 0);
  return Number.isFinite(total) && total > 0 ? total : null;
}

function formatUsd(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatGridHealth(openOrders: number, gridCount: number | null) {
  const openLabel = gridCount === null ? `${openOrders}` : `${openOrders}/${gridCount}`;
  return `${openLabel} active`;
}

function getBaseSymbol(market?: string | null) {
  if (!market) {
    return null;
  }
  const [base] = market.includes("/") ? market.split("/") : market.split("-");
  return base?.trim() || null;
}

function formatInventorySkew(base: number | null, quote: number | null, lastPrice: number | null) {
  if (base === null || quote === null || lastPrice === null) {
    return null;
  }
  const baseValue = base * lastPrice;
  const total = baseValue + quote;
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }
  const basePct = Math.round((baseValue / total) * 100);
  const quotePct = Math.max(0, 100 - basePct);
  return `${basePct}/${quotePct}`;
}

function computeBenchmarkNav(startNav: number | null, startPrice: number | null, lastPrice: number | null) {
  if (startNav === null || startPrice === null || lastPrice === null) {
    return null;
  }
  if (!Number.isFinite(startNav) || !Number.isFinite(startPrice) || !Number.isFinite(lastPrice) || startPrice <= 0) {
    return null;
  }
  return startNav * (lastPrice / startPrice);
}

function computeAlpha(nav: number | null, benchmarkNav: number | null) {
  if (nav === null || benchmarkNav === null) {
    return null;
  }
  return nav - benchmarkNav;
}

function mergePriceSeries(
  seed: Array<{ time: import("lightweight-charts").UTCTimestamp; value: number }>,
  live: Array<{ time: import("lightweight-charts").UTCTimestamp; value: number }>
) {
  const map = new Map<number, number>();
  seed.forEach((point) => map.set(Number(point.time), point.value));
  live.forEach((point) => map.set(Number(point.time), point.value));
  const merged = Array.from(map.entries())
    .map(([time, value]) => ({ time: time as import("lightweight-charts").UTCTimestamp, value }))
    .sort((a, b) => Number(a.time) - Number(b.time));
  return merged.slice(-120);
}
