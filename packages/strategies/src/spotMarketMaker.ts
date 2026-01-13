import { randomUUID } from "crypto";
import type { Intent } from "@zero/core";
import type { Strategy, StrategyContext } from "./types";

type AnchorState = {
  price: number;
  refreshedAt: number;
};

type DesiredOrder = {
  side: "buy" | "sell";
  price: number;
  size: number;
};

export class SpotMarketMakerSlowStrategy implements Strategy {
  key = "spot_mm_slow";
  private anchors = new Map<string, AnchorState>();

  async run(context: StrategyContext): Promise<Intent[]> {
    const { botConfig, botState, market, openOrders } = context;
    const maker = botConfig.marketMaker;
    if (!maker || !market.lastPrice) {
      return [];
    }

    const mid = Number(market.lastPrice);
    if (!Number.isFinite(mid) || mid <= 0) {
      return [];
    }

    const now = Date.now();
    const refreshMs = Math.max(5, maker.refreshSeconds) * 1000;
    const anchor = this.anchors.get(botState.botId);
    const driftBps = anchor ? Math.abs(mid - anchor.price) / anchor.price * 10000 : Number.POSITIVE_INFINITY;
    const shouldRefresh =
      !anchor ||
      now - anchor.refreshedAt >= refreshMs ||
      driftBps >= Math.max(1, maker.repriceBps);

    if (!shouldRefresh) {
      return [];
    }

    this.anchors.set(botState.botId, { price: mid, refreshedAt: now });

    const levels = Math.max(1, Math.floor(maker.levels));
    const orderSize = Number(maker.orderSize);
    if (!Number.isFinite(orderSize) || orderSize <= 0) {
      return [];
    }

    const halfSpreadBps = Math.max(1, maker.halfSpreadBps);
    const spacingBps = Math.max(1, maker.levelSpacingBps);

    const desired: DesiredOrder[] = [];
    for (let i = 0; i < levels; i += 1) {
      const offsetBps = halfSpreadBps + spacingBps * i;
      const buyPrice = mid * (1 - offsetBps / 10000);
      const sellPrice = mid * (1 + offsetBps / 10000);
      desired.push({ side: "buy", price: buyPrice, size: orderSize });
      desired.push({ side: "sell", price: sellPrice, size: orderSize });
    }

    const toleranceBps = Math.max(1, Math.floor(spacingBps / 10));
    const remaining = [...desired];
    const intents: Intent[] = [];

    for (const order of openOrders) {
      const idx = remaining.findIndex((target) =>
        matchesOrder(order, target, toleranceBps)
      );
      if (idx >= 0) {
        remaining.splice(idx, 1);
        continue;
      }
      intents.push({
        id: randomUUID(),
        botId: botState.botId,
        kind: "cancel_limit_order",
        createdAt: new Date().toISOString(),
        orderId: order.id,
        externalId: order.externalId,
        side: order.side,
        price: order.price,
        size: order.size
      });
    }

    for (const target of remaining) {
      intents.push({
        id: randomUUID(),
        botId: botState.botId,
        kind: "place_limit_order",
        createdAt: new Date().toISOString(),
        symbol: botConfig.market,
        side: target.side,
        price: target.price.toFixed(6),
        size: target.size.toFixed(6)
      });
    }

    return intents;
  }
}

function matchesOrder(
  order: { side: "buy" | "sell"; price: string; size: string },
  target: DesiredOrder,
  toleranceBps: number
) {
  const orderPrice = Number(order.price);
  const orderSize = Number(order.size);
  if (!Number.isFinite(orderPrice) || !Number.isFinite(orderSize)) {
    return false;
  }
  if (order.side !== target.side) {
    return false;
  }
  const priceDiffBps = Math.abs(orderPrice - target.price) / target.price * 10000;
  const sizeDiff = Math.abs(orderSize - target.size);
  return priceDiffBps <= toleranceBps && sizeDiff <= target.size * 0.001;
}
