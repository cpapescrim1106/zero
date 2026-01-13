"use client";

import { createChart, ColorType, LineSeries, type IPriceLine, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";

export interface LineChartPoint {
  time: UTCTimestamp;
  value: number;
}

export interface LineChartProps {
  data: LineChartPoint[];
  height?: number;
  color?: string;
  priceLines?: Array<{ price: number; color?: string; title?: string }>;
}

export default function LineChart({ data, height = 220, color = "#0f172a", priceLines = [] }: LineChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const normalizedData = useMemo(() => normalizeSeries(data), [data]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#475569",
        fontFamily: "var(--font-display, ui-serif)"
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.2)" },
        horzLines: { color: "rgba(148, 163, 184, 0.2)" }
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.4)",
        timeVisible: true,
        secondsVisible: false
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.4)"
      }
    });

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2
    });
    series.setData(normalizedData);
    chartRef.current = chart;
    seriesRef.current = series;

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
  }, [color, height, normalizedData]);

  useEffect(() => {
    if (!seriesRef.current) {
      return;
    }
    priceLinesRef.current.forEach((line) => seriesRef.current?.removePriceLine(line));
    priceLinesRef.current = priceLines.map((line) =>
      seriesRef.current!.createPriceLine({
        price: line.price,
        color: line.color ?? "rgba(15, 23, 42, 0.4)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: line.title
      })
    );
  }, [priceLines]);

  useEffect(() => {
    if (!seriesRef.current) {
      return;
    }
    seriesRef.current.setData(normalizedData);
  }, [normalizedData]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}

function normalizeSeries(data: LineChartPoint[]) {
  if (data.length <= 1) {
    return data;
  }
  const sorted = [...data].sort((a, b) => Number(a.time) - Number(b.time));
  const deduped: LineChartPoint[] = [];
  for (const point of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.time === point.time) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
    }
  }
  return deduped;
}
