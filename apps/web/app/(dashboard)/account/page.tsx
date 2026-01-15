"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import LineChart from "../../../components/charts/LineChart";
import MetricCard from "../../../components/ui/MetricCard";
import { fetchAccountFills, fetchAccountSnapshots, type ApiAccountBalance, type ApiAccountSnapshot, type ApiFill } from "../../../lib/api";

const RANGE_OPTIONS = [
  { key: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "All", ms: null }
] as const;

const STABLE_SYMBOLS = new Set(["USDC", "USDT", "USD"]);

export default function AccountPage() {
  const [rangeKey, setRangeKey] = useState<(typeof RANGE_OPTIONS)[number]["key"]>("24h");
  const range = RANGE_OPTIONS.find((option) => option.key === rangeKey) ?? RANGE_OPTIONS[0];
  const since = range.ms ? new Date(Date.now() - range.ms).toISOString() : undefined;
  const snapshotLimit = range.ms ? Math.ceil(range.ms / 60000) + 10 : 50000;

  const { data: snapshotData, isLoading: snapshotsLoading } = useQuery({
    queryKey: ["accountSnapshots", rangeKey],
    queryFn: () => fetchAccountSnapshots({ since, limit: snapshotLimit }),
    refetchInterval: 60000
  });

  const { data: fillsData, isLoading: fillsLoading } = useQuery({
    queryKey: ["accountFills", rangeKey],
    queryFn: () => fetchAccountFills({ since, limit: 20000 }),
    refetchInterval: 60000
  });

  const snapshots = snapshotData?.snapshots ?? [];
  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const balances = Array.isArray(latestSnapshot?.balances) ? latestSnapshot?.balances ?? [] : [];
  const fills = fillsData?.fills ?? [];

  const equitySeries = useMemo(
    () =>
      snapshots
        .filter((snapshot) => snapshot.equity)
        .map((snapshot) => ({
          time: toTimestamp(snapshot.ts),
          value: Number(snapshot.equity)
        })),
    [snapshots]
  );

  const priceHistory = useMemo(() => buildPriceHistory(snapshots), [snapshots]);

  const totals = useMemo(() => {
    const start = parseNumber(snapshots[0]?.equity);
    const end = parseNumber(latestSnapshot?.equity);
    const totalProfit = start !== null && end !== null ? end - start : null;
    const fees = sumFeesUsd(fills, priceHistory);
    const realized = sumRealizedUsd(fills, priceHistory);
    const netProfit = totalProfit !== null ? totalProfit - fees : null;
    const unrealized = totalProfit !== null ? totalProfit - realized : null;
    return { start, end, totalProfit, fees, realized, netProfit, unrealized };
  }, [fills, latestSnapshot, priceHistory, snapshots]);

  const feeSeries = useMemo(() => buildFeeSeries(fills, priceHistory), [fills, priceHistory]);

  const allocationRows = balances
    .filter((balance) => balance.usdValue && Number(balance.usdValue) > 0)
    .map((balance) => ({
      ...balance,
      numericUsd: Number(balance.usdValue)
    }))
    .sort((a, b) => b.numericUsd - a.numericUsd);
  const allocationTotal = allocationRows.reduce((sum, row) => sum + row.numericUsd, 0);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Account</h3>
          <p className="text-xs text-muted">Wallet equity, balances, and profit.</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-white/70 p-0.5 text-[11px] font-semibold text-text">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setRangeKey(option.key)}
              className={
                option.key === rangeKey
                  ? "rounded-full bg-accent px-2.5 py-0.5 text-white"
                  : "rounded-full px-2.5 py-0.5 text-muted hover:text-text"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Equity" value={formatCurrency(totals.end)} hint="Latest snapshot" />
        <MetricCard label="Total profit" value={formatCurrency(totals.totalProfit)} hint={`Range ${range.label}`} />
        <MetricCard label="Net profit" value={formatCurrency(totals.netProfit)} hint="After fees" />
        <MetricCard label="Fees" value={formatCurrency(totals.fees)} hint="Estimated" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Realized PnL" value={formatCurrency(totals.realized)} hint="Fills only" />
        <MetricCard label="Unrealized PnL" value={formatCurrency(totals.unrealized)} hint="Equity delta" />
        <MetricCard label="Start equity" value={formatCurrency(totals.start)} hint="Range baseline" />
        <MetricCard label="End equity" value={formatCurrency(totals.end)} hint="Range end" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Wallet equity">
          {snapshotsLoading ? (
            <ChartPlaceholder label="Loading snapshots..." />
          ) : equitySeries.length === 0 ? (
            <EmptyChart label="No account snapshots yet." />
          ) : (
            <LineChart data={equitySeries} />
          )}
        </Card>
        <Card title="Allocation">
          {balances.length === 0 ? (
            <EmptyChart label="No balances yet." />
          ) : (
            <AllocationChart rows={allocationRows} total={allocationTotal} />
          )}
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Balances">
          <BalancesTable balances={balances} />
        </Card>
        <Card title="Fees over time">
          {fillsLoading ? (
            <ChartPlaceholder label="Loading fills..." />
          ) : feeSeries.length === 0 ? (
            <EmptyChart label="No fees yet." />
          ) : (
            <LineChart data={feeSeries} color="#be123c" />
          )}
        </Card>
      </div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-panel/90 p-4 shadow-card">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ChartPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-white/60 text-[11px] text-muted">
      {label}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-white/60 text-[11px] text-muted">
      {label}
    </div>
  );
}

function AllocationChart({ rows, total }: { rows: Array<ApiAccountBalance & { numericUsd?: number }>; total: number }) {
  if (!total || rows.length === 0) {
    return <EmptyChart label="No priced balances yet." />;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const share = total > 0 ? ((row.numericUsd ?? 0) / total) * 100 : 0;
        const label = row.symbol ?? shortMint(row.mint);
        return (
          <div key={row.mint} className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span className="uppercase tracking-[0.2em]">{label}</span>
              <span>{share.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/60">
              <div className="h-2 rounded-full bg-accent" style={{ width: `${share}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BalancesTable({ balances }: { balances: ApiAccountBalance[] }) {
  if (balances.length === 0) {
    return <p className="text-sm text-muted">No balances yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white/70">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted">
          <tr>
            <th className="px-3 py-2">Asset</th>
            <th className="px-3 py-2">Amount</th>
            <th className="px-3 py-2">Price</th>
            <th className="px-3 py-2 text-right">USD Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {balances.map((balance) => (
            <tr key={balance.mint}>
              <td className="px-3 py-2 font-medium">{balance.symbol ?? shortMint(balance.mint)}</td>
              <td className="px-3 py-2">{balance.amount}</td>
              <td className="px-3 py-2">{balance.priceUsd ? formatCurrency(Number(balance.priceUsd)) : "-"}</td>
              <td className="px-3 py-2 text-right">
                {balance.usdValue ? formatCurrency(Number(balance.usdValue)) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildPriceHistory(snapshots: ApiAccountSnapshot[]) {
  const history = new Map<string, Array<{ ts: number; price: number }>>();
  for (const snapshot of snapshots) {
    const ts = new Date(snapshot.ts).getTime();
    if (!Array.isArray(snapshot.balances)) {
      continue;
    }
    for (const balance of snapshot.balances) {
      if (!balance.symbol || !balance.priceUsd) {
        continue;
      }
      const price = Number(balance.priceUsd);
      if (!Number.isFinite(price)) {
        continue;
      }
      const key = balance.symbol.toUpperCase();
      const list = history.get(key) ?? [];
      list.push({ ts, price });
      history.set(key, list);
    }
  }
  for (const list of history.values()) {
    list.sort((a, b) => a.ts - b.ts);
  }
  return history;
}

function buildFeeSeries(fills: ApiFill[], priceHistory: Map<string, Array<{ ts: number; price: number }>>) {
  const sorted = [...fills].sort((a, b) => new Date(a.filledAt).getTime() - new Date(b.filledAt).getTime());
  const series: Array<{ time: number; value: number }> = [];
  let running = 0;
  for (const fill of sorted) {
    running += feeUsdForFill(fill, priceHistory);
    const time = toTimestamp(fill.filledAt);
    series.push({ time, value: Number(running.toFixed(2)) });
  }
  return series;
}

function sumFeesUsd(fills: ApiFill[], priceHistory: Map<string, Array<{ ts: number; price: number }>>) {
  return fills.reduce((sum, fill) => sum + feeUsdForFill(fill, priceHistory), 0);
}

function sumRealizedUsd(fills: ApiFill[], priceHistory: Map<string, Array<{ ts: number; price: number }>>) {
  return fills.reduce((sum, fill) => sum + realizedUsdForFill(fill, priceHistory), 0);
}

function feeUsdForFill(fill: ApiFill, priceHistory: Map<string, Array<{ ts: number; price: number }>>) {
  const fee = parseNumber(fill.fees);
  if (fee === null || fee === 0) {
    return 0;
  }
  const quoteSymbol = parseQuoteSymbol(fill.order?.market);
  if (!quoteSymbol) {
    return 0;
  }
  if (STABLE_SYMBOLS.has(quoteSymbol)) {
    return fee;
  }
  const price = priceAtTime(priceHistory, quoteSymbol, fill.filledAt);
  return price !== null ? fee * price : 0;
}

function realizedUsdForFill(fill: ApiFill, priceHistory: Map<string, Array<{ ts: number; price: number }>>) {
  const realized = parseNumber(fill.realizedPnl);
  if (realized === null || realized === 0) {
    return 0;
  }
  const quoteSymbol = parseQuoteSymbol(fill.order?.market);
  if (!quoteSymbol) {
    return 0;
  }
  if (STABLE_SYMBOLS.has(quoteSymbol)) {
    return realized;
  }
  const price = priceAtTime(priceHistory, quoteSymbol, fill.filledAt);
  return price !== null ? realized * price : 0;
}

function priceAtTime(
  priceHistory: Map<string, Array<{ ts: number; price: number }>>,
  symbol: string,
  ts: string
) {
  const history = priceHistory.get(symbol.toUpperCase());
  if (!history || history.length === 0) {
    return null;
  }
  const target = new Date(ts).getTime();
  let candidate = history[0].price;
  for (const point of history) {
    if (point.ts > target) {
      break;
    }
    candidate = point.price;
  }
  return candidate ?? null;
}

function parseNumber(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function parseQuoteSymbol(market?: string | null) {
  if (!market) {
    return null;
  }
  const parts = market.includes("/") ? market.split("/") : market.split("-");
  if (parts.length !== 2) {
    return null;
  }
  return parts[1].toUpperCase();
}

function shortMint(mint: string) {
  return mint.length > 10 ? `${mint.slice(0, 4)}...${mint.slice(-4)}` : mint;
}

function toTimestamp(value: string) {
  return Math.floor(new Date(value).getTime() / 1000) as unknown as import("lightweight-charts").UTCTimestamp;
}
