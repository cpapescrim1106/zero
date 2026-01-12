import { randomUUID } from "crypto";
import type { NormalizedEvent } from "@zero/core";

interface PricePollerOptions {
  symbols: string[];
  intervalMs: number;
  jupiterPriceUrl: string;
  onEvent: (event: NormalizedEvent) => void;
}

export class PricePoller {
  private timer?: NodeJS.Timeout;
  private options: PricePollerOptions;

  constructor(options: PricePollerOptions) {
    this.options = options;
  }

  start() {
    if (this.options.symbols.length === 0) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.intervalMs);
    void this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async tick() {
    try {
      const ids = this.options.symbols.join(",");
      const url = `${this.options.jupiterPriceUrl}?ids=${encodeURIComponent(ids)}`;
      const response = await fetch(url);
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { data?: Record<string, { price?: number }> };
      const data = payload?.data ?? {};
      const ts = new Date().toISOString();
      for (const symbol of this.options.symbols) {
        const price = data[symbol]?.price;
        if (typeof price !== "number") {
          continue;
        }
        const event: NormalizedEvent = {
          id: randomUUID(),
          version: "v1",
          kind: "price",
          ts,
          source: "jupiter",
          symbol,
          price: price.toString()
        };
        this.options.onEvent(event);
      }
    } catch {
      // swallow errors; price polling is best-effort
    }
  }
}
