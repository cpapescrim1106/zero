import type {
  CancelAllIntent,
  CancelLimitOrderIntent,
  PlaceLimitOrderIntent,
  ReplaceLimitOrderIntent
} from "@zero/core";
import type { ExecutionConnector, ExecutionResult, OpenOrder, ReconcileResult } from "./types";

export interface JupiterLimitOrderConfig {
  apiUrl: string;
  privateKey: string;
}

export class JupiterLimitOrderConnector implements ExecutionConnector {
  venue = "jupiter";
  constructor(private config: JupiterLimitOrderConfig) {}

  async placeLimitOrder(_: PlaceLimitOrderIntent): Promise<ExecutionResult> {
    return { ok: false, error: "JupiterLimitOrderConnector not implemented" };
  }

  async cancelLimitOrder(_: CancelLimitOrderIntent): Promise<ExecutionResult> {
    return { ok: false, error: "JupiterLimitOrderConnector not implemented" };
  }

  async cancelAll(_: CancelAllIntent): Promise<ExecutionResult> {
    return { ok: false, error: "JupiterLimitOrderConnector not implemented" };
  }

  async replaceLimitOrder(_: ReplaceLimitOrderIntent): Promise<ExecutionResult> {
    return { ok: false, error: "JupiterLimitOrderConnector not implemented" };
  }

  async getOpenOrders(_: string): Promise<OpenOrder[]> {
    return [];
  }

  async reconcile(_: string): Promise<ReconcileResult> {
    return { ok: false, message: "JupiterLimitOrderConnector not implemented" };
  }
}
