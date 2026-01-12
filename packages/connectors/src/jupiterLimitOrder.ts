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
    throw new Error("JupiterLimitOrderConnector not implemented");
  }

  async cancelLimitOrder(_: CancelLimitOrderIntent): Promise<ExecutionResult> {
    throw new Error("JupiterLimitOrderConnector not implemented");
  }

  async cancelAll(_: CancelAllIntent): Promise<ExecutionResult> {
    throw new Error("JupiterLimitOrderConnector not implemented");
  }

  async replaceLimitOrder(_: ReplaceLimitOrderIntent): Promise<ExecutionResult> {
    throw new Error("JupiterLimitOrderConnector not implemented");
  }

  async getOpenOrders(_: string): Promise<OpenOrder[]> {
    throw new Error("JupiterLimitOrderConnector not implemented");
  }

  async reconcile(_: string): Promise<ReconcileResult> {
    throw new Error("JupiterLimitOrderConnector not implemented");
  }
}
