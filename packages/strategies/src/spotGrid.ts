import { randomUUID } from "crypto";
import type { Intent } from "@zero/core";
import type { Strategy, StrategyContext, StrategyOrder } from "./types";

export class SpotGridStaticStrategy implements Strategy {
  key = "spot_grid_static";

  async run(context: StrategyContext): Promise<Intent[]> {
    const { botConfig, botState, market, openOrders } = context;
    if (!botConfig.grid || !market.lastPrice) {
      return [];
    }
    const lower = Number(botConfig.grid.lowerPrice);
    const upper = Number(botConfig.grid.upperPrice);
    const mid = Number.isFinite(lower) && Number.isFinite(upper) ? ((lower + upper) / 2).toFixed(6) : undefined;
    return buildGridIntents(
      botState.botId,
      botConfig.market,
      market.lastPrice,
      botConfig.grid,
      openOrders,
      mid,
      botState.gridGapIndex ?? null
    );
  }
}

export class SpotGridDynamicStrategy implements Strategy {
  key = "spot_grid_dynamic";

  async run(context: StrategyContext): Promise<Intent[]> {
    const { botConfig, botState, market, openOrders } = context;
    if (!botConfig.grid || !market.lastPrice) {
      return [];
    }
    return buildGridIntents(
      botState.botId,
      botConfig.market,
      market.lastPrice,
      botConfig.grid,
      openOrders,
      undefined,
      botState.gridGapIndex ?? null
    );
  }
}

function buildGridIntents(
  botId: string,
  market: string,
  lastPrice: string,
  grid: {
    symbol: string;
    lowerPrice: string;
    upperPrice: string;
    gridCount: number;
    orderSize: string;
    maxQuoteBudget?: string;
    maxBaseBudget?: string;
  },
  openOrders: StrategyOrder[],
  midOverride?: string,
  gapIndexOverride?: number | null
): Intent[] {
  const lower = Number(grid.lowerPrice);
  const upper = Number(grid.upperPrice);
  const count = Math.max(1, Math.floor(grid.gridCount));
  const mid = Number(midOverride ?? lastPrice);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || !Number.isFinite(mid) || upper <= lower) {
    return [];
  }
  const step = count === 1 ? 0 : (upper - lower) / (count - 1);
  const orderSize = Number(grid.orderSize);
  if (!Number.isFinite(orderSize) || orderSize <= 0) {
    return [];
  }
  const existing = openOrders.map((order) => ({
    id: order.id,
    externalId: order.externalId,
    side: order.side,
    price: Number(order.price),
    size: Number(order.size)
  }));
  const quoteBudget = Number(grid.maxQuoteBudget);
  const baseBudget = Number(grid.maxBaseBudget);
  const hasQuoteBudget = Number.isFinite(quoteBudget) && quoteBudget > 0;
  const hasBaseBudget = Number.isFinite(baseBudget) && baseBudget > 0;
  const budgetEpsilon = 1e-9;

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

  const buys = candidates.filter((order): order is { side: "buy"; price: number } => order.side === "buy").sort((a, b) => b.price - a.price);
  const sells = candidates.filter((order): order is { side: "sell"; price: number } => order.side === "sell").sort((a, b) => a.price - b.price);

  const allowedBuys: Array<{ side: "buy"; price: number }> = [];
  let quoteUsed = 0;
  for (const order of buys) {
    const notional = order.price * orderSize;
    if (hasQuoteBudget && quoteUsed + notional - quoteBudget > budgetEpsilon) {
      break;
    }
    quoteUsed += notional;
    allowedBuys.push(order);
  }

  const allowedSells: Array<{ side: "sell"; price: number }> = [];
  let baseUsed = 0;
  for (const order of sells) {
    const newUsed = baseUsed + orderSize;
    if (hasBaseBudget && newUsed - baseBudget > budgetEpsilon) {
      break;
    }
    baseUsed = newUsed;
    allowedSells.push(order);
  }

  const intents: Intent[] = [];
  const priceEpsilon = Math.max(step * 0.001, 1e-6);
  const levelOrders = new Map<number, StrategyOrder[]>();
  for (const order of openOrders) {
    const price = Number(order.price);
    if (!Number.isFinite(price)) {
      continue;
    }
    const index = Math.round((price - lower) / step);
    if (!Number.isFinite(index)) {
      continue;
    }
    if (!levelOrders.has(index)) {
      levelOrders.set(index, []);
    }
    levelOrders.get(index)!.push(order);
  }

  const gridPrices = Array.from({ length: count }, (_, idx) => lower + step * idx);
  const gapIndex =
    typeof gapIndexOverride === "number" && Number.isFinite(gapIndexOverride)
      ? Math.min(count - 1, Math.max(0, Math.round(gapIndexOverride)))
      : null;
  for (let i = 0; i < gridPrices.length; i += 1) {
    const price = gridPrices[i];
    if (price === undefined || !Number.isFinite(price)) {
      continue;
    }
    const desiredSide: "buy" | "sell" | "none" =
      gapIndex !== null
        ? i < gapIndex
          ? "buy"
          : i > gapIndex
            ? "sell"
            : "none"
        : price < mid
          ? "buy"
          : "sell";
    const existingAtLevel = levelOrders.get(i) ?? [];
    for (const order of existingAtLevel) {
      if (desiredSide === "none" || order.side !== desiredSide) {
        intents.push({
          id: randomUUID(),
          botId,
          kind: "cancel_limit_order",
          createdAt: new Date().toISOString(),
          orderId: order.id,
          externalId: order.externalId,
          side: order.side,
          price: order.price,
          size: order.size,
          reason: "grid_gap"
        });
      }
    }
    if (desiredSide === "none") {
      continue;
    }
    if (existingAtLevel.some((order) => order.side === desiredSide)) {
      continue;
    }
    if (existing.some((entry) => Math.abs(entry.price - price) < priceEpsilon)) {
      continue;
    }
    intents.push({
      id: randomUUID(),
      botId,
      kind: "place_limit_order",
      createdAt: new Date().toISOString(),
      symbol: market,
      side: desiredSide,
      price: price.toFixed(6),
      size: orderSize.toFixed(6)
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
