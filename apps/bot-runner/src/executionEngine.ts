import { randomUUID } from "crypto";
import type { Intent, IntentEvent, NormalizedEvent, OrderEvent } from "@zero/core";
import type { ExecutionConnector, ExecutionResult } from "@zero/connectors";

export interface ExecutionReport {
  events: NormalizedEvent[];
}

export class ExecutionEngine {
  constructor(private connector: ExecutionConnector) {}

  async execute(botId: string, intents: Intent[]): Promise<ExecutionReport> {
    const events: NormalizedEvent[] = [];

    for (const intent of intents) {
      events.push(this.buildIntentEvent(botId, intent));

      if (intent.kind === "place_limit_order") {
        const result = await this.safeCall(() => this.connector.placeLimitOrder(intent));
        events.push(this.buildOrderEvent(botId, intent, result));
      } else if (intent.kind === "cancel_limit_order") {
        await this.safeCall(() => this.connector.cancelLimitOrder(intent));
      } else if (intent.kind === "cancel_all") {
        await this.safeCall(() => this.connector.cancelAll(intent));
      } else if (intent.kind === "replace_limit_order") {
        await this.safeCall(() => this.connector.replaceLimitOrder(intent));
      }
    }

    return { events };
  }

  private buildIntentEvent(botId: string, intent: Intent): IntentEvent {
    return {
      id: randomUUID(),
      version: "v1",
      kind: "intent",
      ts: new Date().toISOString(),
      source: "internal",
      botId,
      intent
    };
  }

  private buildOrderEvent(botId: string, intent: Extract<Intent, { kind: "place_limit_order" }>, result: ExecutionResult): OrderEvent {
    return {
      id: randomUUID(),
      version: "v1",
      kind: "order",
      ts: new Date().toISOString(),
      source: "jupiter",
      botId,
      orderId: intent.id,
      venue: this.connector.venue,
      externalId: result.externalId,
      side: intent.side,
      price: intent.price,
      size: intent.size,
      status: result.ok ? "new" : "rejected"
    };
  }

  private async safeCall(fn: () => Promise<ExecutionResult>) {
    try {
      return await fn();
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
