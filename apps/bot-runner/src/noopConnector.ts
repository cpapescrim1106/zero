import type {
  CancelAllIntent,
  CancelLimitOrderIntent,
  PlaceLimitOrderIntent,
  ReplaceLimitOrderIntent
} from "@zero/core";
import type { ExecutionConnector, ExecutionResult, OpenOrder, ReconcileResult } from "@zero/connectors";

export class NoopConnector implements ExecutionConnector {
  venue = "noop";

  async placeLimitOrder(_intent: PlaceLimitOrderIntent): Promise<ExecutionResult> {
    return { ok: false, error: "execution disabled" };
  }

  async cancelLimitOrder(_intent: CancelLimitOrderIntent): Promise<ExecutionResult> {
    return { ok: false, error: "execution disabled" };
  }

  async cancelAll(_intent: CancelAllIntent): Promise<ExecutionResult> {
    return { ok: false, error: "execution disabled" };
  }

  async replaceLimitOrder(_intent: ReplaceLimitOrderIntent): Promise<ExecutionResult> {
    return { ok: false, error: "execution disabled" };
  }

  async getOpenOrders(_market: string): Promise<OpenOrder[]> {
    return [];
  }

  async reconcile(_market: string): Promise<ReconcileResult> {
    return { ok: false, message: "execution disabled" };
  }
}
