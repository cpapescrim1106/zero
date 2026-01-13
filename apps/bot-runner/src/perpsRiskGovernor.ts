import { randomUUID } from "crypto";
import type { Intent, PerpsRiskConfig, RiskEvent, RiskState } from "@zero/core";
import type { MarketState } from "@zero/strategies";

export interface PerpsRiskDecision {
  allowedIntents: Intent[];
  riskState: RiskState;
  riskEvent?: RiskEvent;
}

export const DEFAULT_PERPS_RISK_CONFIG: PerpsRiskConfig = {
  liquidationBufferPct: 5,
  liquidationBufferHealthRatio: 1.2,
  leverageCap: 3,
  maxDailyLoss: "150",
  maxNotional: "2000",
  fundingGuardrailBps: 50,
  markOracleDivergenceBps: 50,
  reduceOnlyTriggerBps: 200
};

export class PerpsRiskGovernor {
  evaluate(
    current: RiskState,
    intents: Intent[],
    botId: string,
    market: MarketState | undefined,
    config: PerpsRiskConfig
  ): PerpsRiskDecision {
    const ts = new Date().toISOString();
    const riskState: RiskState = {
      ...current,
      lastCheckedAt: ts
    };

    const divergence = market?.markOracleDivergenceBps;
    if (Number.isFinite(divergence) && divergence !== undefined && divergence >= config.markOracleDivergenceBps) {
      riskState.status = "paused";
      const event = this.buildEvent(botId, "mark_oracle_divergence", "pause", {
        divergenceBps: divergence
      });
      return { allowedIntents: [], riskState, riskEvent: event };
    }

    const fundingRate = market?.fundingRate ? Number(market.fundingRate) : null;
    if (fundingRate !== null && Number.isFinite(fundingRate)) {
      const fundingBps = Math.abs(fundingRate * 10_000);
      if (fundingBps >= config.fundingGuardrailBps) {
        riskState.status = "reduce_only";
        const filtered = intents.filter(
          (intent) => intent.kind !== "place_limit_order" || intent.reduceOnly === true
        );
        const event = this.buildEvent(botId, "funding_guardrail", "reduce_only", {
          fundingBps
        });
        return { allowedIntents: filtered, riskState, riskEvent: event };
      }
    }

    return { allowedIntents: intents, riskState };
  }

  private buildEvent(botId: string, reason: RiskEvent["reason"], action: RiskEvent["action"], context?: Record<string, unknown>): RiskEvent {
    return {
      id: randomUUID(),
      version: "v1",
      kind: "risk",
      ts: new Date().toISOString(),
      source: "internal",
      botId,
      reason,
      action,
      context
    };
  }
}
