"use client";

import { ColorType, createChart, LineSeries, type IPriceLine, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";

export type GridLevelOrder = {
  price: number;
  size: number;
  side: "buy" | "sell";
};

export interface GridLevelsChartProps {
  orders: GridLevelOrder[];
  midPrice?: number;
  height?: number;
  compact?: boolean;
  priceSeries?: Array<{ time: UTCTimestamp; value: number }>;
  className?: string;
}

export default function GridLevelsChart({
  orders,
  midPrice,
  height = 360,
  compact = false,
  priceSeries = [],
  className
}: GridLevelsChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const rangeSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  const priceRange = useMemo(() => {
    const orderPrices = orders.map((order) => order.price).filter((price) => Number.isFinite(price));
    const seriesPrices = priceSeries.map((point) => point.value).filter((price) => Number.isFinite(price));
    const mid = Number.isFinite(midPrice as number) ? (midPrice as number) : null;
    const combined = mid !== null ? [...orderPrices, ...seriesPrices, mid] : [...orderPrices, ...seriesPrices];
    if (combined.length === 0) {
      return { min: 0.8, max: 1.2 };
    }
    const min = Math.min(...combined);
    const max = Math.max(...combined);
    if (mid !== null) {
      const spread = Math.max(mid - min, max - mid, mid * 0.002);
      const pad = spread * 1.2;
      return { min: Math.max(0, mid - pad), max: mid + pad };
    }
    const pad = (max - min) * 0.08 || min * 0.02;
    return { min: Math.max(0, min - pad), max: max + pad };
  }, [orders, midPrice, priceSeries]);

  const timeRange = useMemo(() => {
    const times = priceSeries.map((point) => Number(point.time)).filter((time) => Number.isFinite(time));
    const now = Math.floor(Date.now() / 1000);
    if (times.length === 0) {
      return { start: now - 60, end: now };
    }
    const start = Math.min(...times);
    const end = Math.max(...times);
    return { start, end: end <= start ? start + 60 : end };
  }, [priceSeries]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#475569",
        fontFamily: "var(--font-mono, ui-monospace)"
      },
      grid: compact
        ? {
            vertLines: { visible: false },
            horzLines: { visible: false }
          }
        : {
            vertLines: { color: "rgba(148, 163, 184, 0.24)" },
            horzLines: { color: "rgba(148, 163, 184, 0.24)" }
          },
      timeScale: {
        visible: false,
        borderVisible: false
      },
      rightPriceScale: {
        visible: !compact,
        borderColor: "rgba(148, 163, 184, 0.35)"
      },
      leftPriceScale: {
        visible: false
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false }
      }
    });

    const rangeSeries = chart.addSeries(LineSeries, {
      color: "rgba(0,0,0,0)",
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false
    });
    const priceSeriesLine = chart.addSeries(LineSeries, {
      color: compact ? "rgba(15, 23, 42, 0.6)" : "rgba(15, 23, 42, 0.8)",
      lineWidth: compact ? 1 : 2,
      lastValueVisible: false,
      priceLineVisible: false
    });

    chartRef.current = chart;
    rangeSeriesRef.current = rangeSeries;
    priceSeriesRef.current = priceSeriesLine;

    const observer = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [compact, height]);

  useEffect(() => {
    if (!rangeSeriesRef.current) {
      return;
    }
    const data = [
      { time: timeRange.start as UTCTimestamp, value: priceRange.min },
      { time: timeRange.end as UTCTimestamp, value: priceRange.max }
    ];
    rangeSeriesRef.current.setData(data);
  }, [priceRange, timeRange]);

  useEffect(() => {
    if (!priceSeriesRef.current) {
      return;
    }
    const data =
      priceSeries.length === 1
        ? [
            priceSeries[0],
            {
              time: timeRange.end as UTCTimestamp,
              value: priceSeries[0].value
            }
          ]
        : priceSeries;
    priceSeriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [priceSeries, timeRange]);

  useEffect(() => {
    if (!rangeSeriesRef.current) {
      return;
    }
    priceLinesRef.current.forEach((line) => rangeSeriesRef.current?.removePriceLine(line));
    priceLinesRef.current = [];

    const mid = midPrice ?? (priceRange.min + priceRange.max) / 2;
    priceLinesRef.current.push(
      rangeSeriesRef.current.createPriceLine({
        price: mid,
        color: "rgba(15, 23, 42, 0.6)",
        lineWidth: 3,
        lineStyle: 0,
        axisLabelVisible: !compact,
        title: compact ? undefined : "last"
      })
    );

    const maxSize = orders.reduce((max, order) => Math.max(max, order.size), 0) || 1;
    orders.forEach((order) => {
      const intensity = Math.min(0.9, Math.max(0.45, order.size / maxSize));
      const color =
        order.side === "buy" ? `rgba(34, 197, 94, ${intensity})` : `rgba(248, 113, 113, ${intensity})`;
      priceLinesRef.current.push(
        rangeSeriesRef.current!.createPriceLine({
          price: order.price,
          color,
          lineWidth: 1 + Math.round((order.size / maxSize) * 1),
          lineStyle: 0,
          axisLabelVisible: false,
          title: undefined
        })
      );
    });
  }, [compact, midPrice, orders, priceRange]);

  return <div ref={containerRef} className={className ?? ""} style={{ height }} />;
}
