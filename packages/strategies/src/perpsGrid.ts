import { randomUUID } from "crypto";
import type { Intent } from "@zero/core";
import type { Strategy, StrategyContext } from "./types";

export class PerpsGridSimpleStrategy implements Strategy {
  key = "perps_grid_simple";

  async run(context: StrategyContext): Promise<Intent[]> {
    const { botConfig, botState, market, openOrders } = context;
    const grid = botConfig.perps?.simpleGrid;
    const price = market.markPrice ?? market.lastPrice;
    if (!grid || !price) {
      return [];
    }
    return buildSimpleGridIntents(botState.botId, grid.symbol, price, grid, openOrders);
  }
}

export class PerpsGridCurveStrategy implements Strategy {
  key = "perps_grid_curve";

  async run(context: StrategyContext): Promise<Intent[]> {
    const { botConfig, botState, market, openOrders } = context;
    const grid = botConfig.perps?.curveGrid;
    const price = market.markPrice ?? market.lastPrice;
    if (!grid || !price) {
      return [];
    }
    return buildCurveGridIntents(botState.botId, grid.symbol, price, grid, openOrders);
  }
}

function buildSimpleGridIntents(
  botId: string,
  market: string,
  lastPrice: string,
  grid: {
    symbol: string;
    lowerPrice: string;
    upperPrice: string;
    gridCount: number;
    orderSize: string;
  },
  openOrders: Array<{ side: "buy" | "sell"; price: string; size: string }>
): Intent[] {
  const lower = Number(grid.lowerPrice);
  const upper = Number(grid.upperPrice);
  const count = Math.max(1, Math.floor(grid.gridCount));
  const mid = Number(lastPrice);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || !Number.isFinite(mid) || upper <= lower) {
    return [];
  }
  const step = count === 1 ? 0 : (upper - lower) / (count - 1);
  const orderSize = Number(grid.orderSize);
  if (!Number.isFinite(orderSize) || orderSize <= 0) {
    return [];
  }
  const existing = openOrders.map((order) => ({
    side: order.side,
    price: Number(order.price),
    size: Number(order.size)
  }));

  const candidates: Array<{ side: "buy" | "sell"; price: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const price = lower + step * i;
    if (Math.abs(price - mid) < step * 0.1) {
      continue;
    }
    candidates.push({
      side: price < mid ? "buy" : "sell",
      price
    });
  }

  return candidates.reduce<Intent[]>((acc, order) => {
    if (hasOrder(existing, order.side, order.price, orderSize)) {
      return acc;
    }
    acc.push({
      id: randomUUID(),
      botId,
      kind: "place_limit_order",
      createdAt: new Date().toISOString(),
      symbol: market,
      side: order.side,
      price: order.price.toFixed(6),
      size: orderSize.toFixed(6)
    });
    return acc;
  }, []);
}

function buildCurveGridIntents(
  botId: string,
  market: string,
  lastPrice: string,
  grid: {
    symbol: string;
    levels: number;
    stepPercent: number;
    baseSize: string;
    bias: "bullish" | "neutral" | "bearish";
  },
  openOrders: Array<{ side: "buy" | "sell"; price: string; size: string }>
): Intent[] {
  const mid = Number(lastPrice);
  const stepPercent = Number(grid.stepPercent);
  const levels = Math.max(1, Math.floor(grid.levels));
  const baseSize = Number(grid.baseSize);
  if (!Number.isFinite(mid) || !Number.isFinite(stepPercent) || !Number.isFinite(baseSize)) {
    return [];
  }
  if (stepPercent <= 0 || baseSize <= 0) {
    return [];
  }

  const biasWeights =
    grid.bias === "bullish"
      ? { buy: 0.6, sell: 0.4 }
      : grid.bias === "bearish"
        ? { buy: 0.4, sell: 0.6 }
        : { buy: 0.5, sell: 0.5 };
  const buyLevels = Math.max(1, Math.round(levels * biasWeights.buy));
  const sellLevels = Math.max(1, levels - buyLevels);

  const existing = openOrders.map((order) => ({
    side: order.side,
    price: Number(order.price),
    size: Number(order.size)
  }));

  const intents: Intent[] = [];
  for (let i = 1; i <= buyLevels; i += 1) {
    const price = mid * (1 - (stepPercent / 100) * i);
    if (price <= 0) {
      continue;
    }
    if (hasOrder(existing, "buy", price, baseSize)) {
      continue;
    }
    intents.push({
      id: randomUUID(),
      botId,
      kind: "place_limit_order",
      createdAt: new Date().toISOString(),
      symbol: market,
      side: "buy",
      price: price.toFixed(6),
      size: baseSize.toFixed(6)
    });
  }

  for (let i = 1; i <= sellLevels; i += 1) {
    const price = mid * (1 + (stepPercent / 100) * i);
    if (hasOrder(existing, "sell", price, baseSize)) {
      continue;
    }
    intents.push({
      id: randomUUID(),
      botId,
      kind: "place_limit_order",
      createdAt: new Date().toISOString(),
      symbol: market,
      side: "sell",
      price: price.toFixed(6),
      size: baseSize.toFixed(6)
    });
  }

  return intents;
}

function hasOrder(
  orders: Array<{ side: "buy" | "sell"; price: number; size: number }>,
  side: "buy" | "sell",
  price: number,
  size: number
) {
  return orders.some(
    (order) => order.side === side && Math.abs(order.price - price) < 1e-6 && Math.abs(order.size - size) < 1e-6
  );
}
