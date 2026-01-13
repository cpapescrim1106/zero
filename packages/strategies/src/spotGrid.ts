import { randomUUID } from "crypto";
import type { Intent } from "@zero/core";
import type { Strategy, StrategyContext } from "./types";

export class SpotGridStaticStrategy implements Strategy {
  key = "spot_grid_static";

  async run(context: StrategyContext): Promise<Intent[]> {
    const { botConfig, botState, market, openOrders } = context;
    if (!botConfig.grid || !market.lastPrice) {
      return [];
    }
    return buildGridIntents(botState.botId, botConfig.market, market.lastPrice, botConfig.grid, openOrders);
  }
}

export class SpotGridDynamicStrategy implements Strategy {
  key = "spot_grid_dynamic";

  async run(context: StrategyContext): Promise<Intent[]> {
    const { botConfig, botState, market, openOrders } = context;
    if (!botConfig.grid || !market.lastPrice) {
      return [];
    }
    return buildGridIntents(botState.botId, botConfig.market, market.lastPrice, botConfig.grid, openOrders);
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
  const quoteBudget = Number(grid.maxQuoteBudget);
  const baseBudget = Number(grid.maxBaseBudget);
  const hasQuoteBudget = Number.isFinite(quoteBudget) && quoteBudget > 0;
  const hasBaseBudget = Number.isFinite(baseBudget) && baseBudget > 0;

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
    if (hasQuoteBudget && quoteUsed + notional > quoteBudget) {
      break;
    }
    quoteUsed += notional;
    allowedBuys.push(order);
  }

  const allowedSells: Array<{ side: "sell"; price: number }> = [];
  let baseUsed = 0;
  for (const order of sells) {
    const newUsed = baseUsed + orderSize;
    if (hasBaseBudget && newUsed > baseBudget) {
      break;
    }
    baseUsed = newUsed;
    allowedSells.push(order);
  }

  const intents: Intent[] = [];
  for (const order of [...allowedBuys, ...allowedSells]) {
    if (hasOrder(existing, order.side, order.price, orderSize)) {
      continue;
    }
    intents.push({
      id: randomUUID(),
      botId,
      kind: "place_limit_order",
      createdAt: new Date().toISOString(),
      symbol: market,
      side: order.side,
      price: order.price.toFixed(6),
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
