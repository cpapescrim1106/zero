import { randomUUID } from "crypto";
import type { Intent, RiskEvent, RiskState } from "@zero/core";

export interface RiskDecision {
  allowedIntents: Intent[];
  riskState: RiskState;
  riskEvent?: RiskEvent;
}

export class RiskGovernor {
  evaluate(current: RiskState, intents: Intent[], botId: string): RiskDecision {
    const ts = new Date().toISOString();
    const riskState: RiskState = {
      ...current,
      lastCheckedAt: ts
    };

    return {
      allowedIntents: intents,
      riskState
    };
  }

  hardStop(botId: string, reason: RiskEvent["reason"], action: RiskEvent["action"]): RiskEvent {
    return {
      id: randomUUID(),
      version: "v1",
      kind: "risk",
      ts: new Date().toISOString(),
      source: "internal",
      botId,
      reason,
      action
    };
  }
}
