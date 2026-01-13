import type { MarketState } from "@zero/strategies";
import type { PerpsMarketEvent, PriceEvent } from "@zero/core";

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

  applyPerpsMarket(event: PerpsMarketEvent) {
    const current = this.state.get(event.market) ?? { symbol: event.market };
    const next: MarketState = {
      ...current,
      markPrice: event.markPrice,
      bid: event.bid ?? current.bid,
      ask: event.ask ?? current.ask,
      oraclePrice: event.oraclePrice,
      fundingRate: event.fundingRate,
      nextFundingTime: event.nextFundingTime,
      markOracleDivergenceBps: event.markOracleDivergenceBps,
      volatility: event.volatility,
      ts: event.ts
    };
    this.state.set(event.market, next);
    return next;
  }

  get(symbol: string) {
    return this.state.get(symbol);
  }
}
