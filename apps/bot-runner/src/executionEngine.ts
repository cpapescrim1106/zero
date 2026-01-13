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
        if (!result.ok) {
          console.warn("[bot-runner] place order failed", {
            botId,
            intentId: intent.id,
            error: result.error
          });
        }
        events.push(this.buildOrderEvent(botId, intent, result));
      } else if (intent.kind === "cancel_limit_order") {
        const result = await this.safeCall(() => this.connector.cancelLimitOrder(intent));
        if (!result.ok) {
          console.warn("[bot-runner] cancel order failed", {
            botId,
            intentId: intent.id,
            error: result.error
          });
        } else {
          const cancelEvent = this.buildCancelEvent(botId, intent);
          if (cancelEvent) {
            events.push(cancelEvent);
          }
        }
      } else if (intent.kind === "cancel_all") {
        const result = await this.safeCall(() => this.connector.cancelAll(intent));
        if (!result.ok) {
          console.warn("[bot-runner] cancel all failed", {
            botId,
            intentId: intent.id,
            error: result.error
          });
        }
      } else if (intent.kind === "replace_limit_order") {
        const result = await this.safeCall(() => this.connector.replaceLimitOrder(intent));
        if (!result.ok) {
          console.warn("[bot-runner] replace order failed", {
            botId,
            intentId: intent.id,
            error: result.error
          });
        }
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
      status: result.ok ? "new" : "rejected",
      error: result.ok ? undefined : result.error
    };
  }

  private buildCancelEvent(botId: string, intent: Extract<Intent, { kind: "cancel_limit_order" }>): OrderEvent | null {
    if (!intent.side) {
      return null;
    }
    return {
      id: randomUUID(),
      version: "v1",
      kind: "order",
      ts: new Date().toISOString(),
      source: "jupiter",
      botId,
      orderId: intent.orderId,
      venue: this.connector.venue,
      externalId: intent.externalId,
      side: intent.side,
      price: intent.price,
      size: intent.size,
      status: "canceled"
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
