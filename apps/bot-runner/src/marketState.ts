import type { MarketState } from "@zero/strategies";
import type { PriceEvent } from "@zero/core";

export class MarketStateStore {
  private state = new Map<string, MarketState>();

  applyPrice(event: PriceEvent) {
    const current = this.state.get(event.symbol) ?? { symbol: event.symbol };
    const next: MarketState = {
      ...current,
      lastPrice: event.price,
      bid: event.bid,
      ask: event.ask,
      ts: event.ts
    };
    this.state.set(event.symbol, next);
    return next;
  }

  get(symbol: string) {
    return this.state.get(symbol);
  }
}
