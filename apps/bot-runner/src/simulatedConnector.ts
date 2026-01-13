import type {
  CancelAllIntent,
  CancelLimitOrderIntent,
  PlaceLimitOrderIntent,
  ReplaceLimitOrderIntent
} from "@zero/core";
import type { ExecutionConnector, ExecutionResult, OpenOrder, ReconcileResult } from "@zero/connectors";

type SimOrder = OpenOrder & { symbol: string };

export class SimulatedConnector implements ExecutionConnector {
  venue = "simulated";
  private orders = new Map<string, SimOrder>();

  async placeLimitOrder(intent: PlaceLimitOrderIntent): Promise<ExecutionResult> {
    const externalId = `sim-${intent.id}`;
    this.orders.set(externalId, {
      orderId: intent.id,
      externalId,
      side: intent.side,
      price: intent.price,
      size: intent.size,
      status: "open",
      symbol: intent.symbol
    });
    return { ok: true, externalId };
  }

  async cancelLimitOrder(intent: CancelLimitOrderIntent): Promise<ExecutionResult> {
    const key = intent.externalId ?? intent.orderId;
    const order = this.orders.get(key);
    if (order) {
      order.status = "canceled";
    }
    return { ok: true };
  }

  async cancelAll(intent: CancelAllIntent): Promise<ExecutionResult> {
    let canceled = 0;
    for (const order of this.orders.values()) {
      if (order.symbol === intent.symbol) {
        if (order.status !== "canceled" && order.status !== "filled") {
          order.status = "canceled";
          canceled += 1;
        }
      }
    }
    return { ok: true, meta: { canceled } };
  }

  async replaceLimitOrder(intent: ReplaceLimitOrderIntent): Promise<ExecutionResult> {
    const key = intent.orderId;
    const existing = this.orders.get(key);
    if (existing) {
      existing.status = "canceled";
    }
    return { ok: true, externalId: `sim-${intent.id}` };
  }

  async getOpenOrders(market: string): Promise<OpenOrder[]> {
    return Array.from(this.orders.values()).filter(
      (order) => order.symbol === market && order.status !== "canceled" && order.status !== "filled"
    );
  }

  async reconcile(market: string): Promise<ReconcileResult> {
    const openOrders = await this.getOpenOrders(market);
    return { ok: true, message: `simulated openOrders=${openOrders.length}` };
  }
}
