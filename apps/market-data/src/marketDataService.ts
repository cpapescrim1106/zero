import type { NormalizedEvent } from "@zero/core";
import { CACHE_KEYS, CHANNELS } from "@zero/core";
import type { MarketDataConfig } from "./config";
import { HeliusProvider } from "./heliusProvider";
import { PricePoller } from "./pricePoller";
import { RedisPublisher } from "./redisPublisher";

export class MarketDataService {
  private publisher: RedisPublisher;
  private helius: HeliusProvider;
  private pricePoller: PricePoller;
  private lastEventAt = Date.now();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(private config: MarketDataConfig) {
    this.publisher = new RedisPublisher(config.redisUrl);
    this.helius = new HeliusProvider({
      wsUrl: config.heliusWsUrl,
      httpUrl: config.heliusHttpUrl,
      walletPubkey: config.walletPubkey,
      commitment: config.commitment,
      onEvent: (event) => void this.handleEvent(event),
      onLog: (message, context) => {
        if (context) {
          console.log("[helius]", message, context);
        } else {
          console.log("[helius]", message);
        }
      }
    });
    this.pricePoller = new PricePoller({
      symbols: config.priceSymbols,
      intervalMs: config.pricePollIntervalMs,
      jupiterPriceUrl: config.jupiterPriceUrl,
      onEvent: (event) => void this.handleEvent(event)
    });
  }

  async start() {
    await this.helius.start();
    this.pricePoller.start();
    this.heartbeatTimer = setInterval(() => {
      void this.checkHealth();
    }, this.config.heartbeatIntervalMs);
    await this.checkHealth();
  }

  async stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.pricePoller.stop();
    await this.helius.stop();
    await this.publisher.close();
  }

  private async handleEvent(event: NormalizedEvent) {
    try {
      this.lastEventAt = Date.now();
      if (event.kind === "price") {
        await this.publisher.publishEvent(CHANNELS.price(event.symbol), event);
        await this.publisher.setCache(CACHE_KEYS.price(event.symbol), event);
        return;
      }
      if (event.kind === "balance") {
        await this.publisher.publishEvent(CHANNELS.walletBalances(event.walletId), event);
        await this.publisher.setCache(CACHE_KEYS.walletBalances(event.walletId), event);
        return;
      }
      if (event.kind === "wallet_tx") {
        await this.publisher.publishEvent(CHANNELS.walletTx(event.walletId), event);
      }
    } catch (err) {
      console.error("[market-data] publish failed", err);
    }
  }

  private async checkHealth() {
    try {
      const now = Date.now();
      const stale = now - this.lastEventAt > this.config.staleSeconds * 1000;
      await this.publisher.publishHealth(
        "market-data",
        stale ? "degraded" : "ok",
        stale ? "market-data stale" : undefined
      );
    } catch (err) {
      console.error("[market-data] health publish failed", err);
    }
  }
}
