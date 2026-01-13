import { randomUUID } from "crypto";
import type { NormalizedEvent } from "@zero/core";

interface PricePollerOptions {
  symbols: string[];
  intervalMs: number;
  jupiterPriceUrl: string;
  priceSource: "jupiter" | "coingecko" | "kraken";
  coingeckoPriceUrl: string;
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
      if (this.options.priceSource === "coingecko") {
        await this.fetchFromCoingecko();
        return;
      }
      if (this.options.priceSource === "kraken") {
        await this.fetchFromKraken();
        return;
      }
      await this.fetchFromJupiter();
    } catch {
      // swallow errors; price polling is best-effort
    }
  }

  private async fetchFromJupiter() {
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
      this.options.onEvent({
        id: randomUUID(),
        version: "v1",
        kind: "price",
        ts,
        source: "jupiter",
        symbol,
        price: price.toString()
      });
    }
  }

  private async fetchFromCoingecko() {
    const ids = this.options.symbols
      .map((symbol) => COINGECKO_IDS[symbol.toUpperCase()])
      .filter(Boolean)
      .join(",");
    if (!ids) {
      return;
    }
    const url = `${this.options.coingeckoPriceUrl}?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
    const response = await fetch(url);
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as Record<string, { usd?: number }>;
    const ts = new Date().toISOString();
    for (const symbol of this.options.symbols) {
      const id = COINGECKO_IDS[symbol.toUpperCase()];
      const price = id ? payload?.[id]?.usd : undefined;
      if (typeof price !== "number") {
        continue;
      }
      this.options.onEvent({
        id: randomUUID(),
        version: "v1",
        kind: "price",
        ts,
        source: "coingecko",
        symbol,
        price: price.toString()
      });
    }
  }

  private async fetchFromKraken() {
    const pairs = this.options.symbols
      .map((symbol) => KRAKEN_PAIRS[symbol.toUpperCase()])
      .filter(Boolean)
      .join(",");
    if (!pairs) {
      return;
    }
    const url = `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pairs)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { result?: Record<string, { c?: string[] }> };
    const result = payload?.result ?? {};
    const ts = new Date().toISOString();
    for (const symbol of this.options.symbols) {
      const pair = KRAKEN_PAIRS[symbol.toUpperCase()];
      const entry = pair ? result[pair] : undefined;
      const price = entry?.c?.[0];
      if (!price) {
        continue;
      }
      this.options.onEvent({
        id: randomUUID(),
        version: "v1",
        kind: "price",
        ts,
        source: "kraken",
        symbol,
        price
      });
    }
  }
}

const COINGECKO_IDS: Record<string, string> = {
  SOL: "solana"
};

const KRAKEN_PAIRS: Record<string, string> = {
  SOL: "SOLUSD"
};
