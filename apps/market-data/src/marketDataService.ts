import type { NormalizedEvent } from "@zero/core";
import { CACHE_KEYS, CHANNELS } from "@zero/core";
import type { MarketDataConfig } from "./config";
import { DriftPerpsPoller } from "./driftPerpsPoller";
import { HeliusProvider } from "./heliusProvider";
import { PerpsMarketRegistry } from "./perpsMarketRegistry";
import { PricePoller } from "./pricePoller";
import { PythPriceService } from "./pythPriceService";
import { RedisPublisher } from "./redisPublisher";

export class MarketDataService {
  private publisher: RedisPublisher;
  private helius?: HeliusProvider;
  private pricePoller: PricePoller;
  private pythPriceService?: PythPriceService;
  private perpsRegistry?: PerpsMarketRegistry;
  private perpsPoller?: DriftPerpsPoller;
  private lastEventAt = Date.now();
  private heartbeatTimer?: NodeJS.Timeout;
  private balancePoller?: NodeJS.Timeout;

  constructor(private config: MarketDataConfig) {
    this.publisher = new RedisPublisher(config.redisUrl);
    if (config.heliusEnabled && config.heliusWsUrl && config.heliusHttpUrl && config.walletPubkey) {
      this.helius = new HeliusProvider({
        wsUrl: config.heliusWsUrl,
        httpUrl: config.heliusHttpUrl,
        walletPubkey: config.walletPubkey,
        commitment: config.commitment,
        subscribeLogs: config.heliusSubscribeLogs,
        subscribeWallet: config.heliusSubscribeWallet,
        subscribeTokens: config.heliusSubscribeTokens,
        tokenMintAllowlist: config.heliusTokenMintAllowlist,
        onEvent: (event) => void this.handleEvent(event),
        onLog: (message, context) => {
          if (context) {
            console.log("[helius]", message, context);
          } else {
            console.log("[helius]", message);
          }
        }
      });
    } else {
      console.log("[market-data] Helius disabled; running price poller only");
    }
    this.pricePoller = new PricePoller({
      symbols: config.priceSymbols,
      intervalMs: config.pricePollIntervalMs,
      jupiterPriceUrl: config.jupiterPriceUrl,
      priceSource: config.priceSource,
      coingeckoPriceUrl: config.coingeckoPriceUrl,
      onEvent: (event) => void this.handleEvent(event)
    });
    if (config.pythEnabled && config.priceSymbols.length > 0) {
      this.pythPriceService = new PythPriceService({
        httpUrl: config.pythHttpUrl,
        wsUrl: config.pythWsUrl,
        symbols: config.priceSymbols,
        onEvent: (event) => void this.handleEvent(event),
        onLog: (message, context) => {
          if (context) {
            console.log("[pyth]", message, context);
          } else {
            console.log("[pyth]", message);
          }
        }
      });
    }
    if (config.perpsEnabled) {
      this.perpsRegistry = new PerpsMarketRegistry(config.redisUrl, config.perpsMarkets);
      this.perpsPoller = new DriftPerpsPoller({
        rpcUrl: config.solanaRpcUrl,
        env: config.driftEnv,
        pollIntervalMs: config.perpsPollIntervalMs,
        onEvent: (event) => void this.handleEvent(event)
      });
      this.perpsRegistry.onUpdate((markets) => this.perpsPoller?.setMarkets(markets));
    }
  }

  async start() {
    if (this.helius) {
      await this.helius.start();
      await this.helius.refreshBalances().catch((err) => {
        console.warn("[market-data] helius balance refresh failed", { error: (err as Error).message });
      });
      if (this.config.balancePollIntervalMs > 0) {
        this.balancePoller = setInterval(() => {
          void this.helius?.refreshBalances().catch((err) => {
            console.warn("[market-data] helius balance refresh failed", { error: (err as Error).message });
          });
        }, this.config.balancePollIntervalMs);
      }
    }
    if (this.pythPriceService) {
      await this.pythPriceService.start().catch((err) => {
        console.warn("[market-data] pyth ws failed; continuing with poller", {
          error: (err as Error).message
        });
      });
    }
    this.pricePoller.start();
    if (this.perpsRegistry && this.perpsPoller) {
      try {
        await this.perpsRegistry.start();
        this.perpsPoller.setMarkets(this.perpsRegistry.getMarkets());
        await this.perpsPoller.start();
      } catch (err) {
        console.warn("[market-data] perps poller failed; continuing with spot prices", {
          error: (err as Error).message
        });
      }
    }
    this.heartbeatTimer = setInterval(() => {
      void this.checkHealth();
    }, this.config.heartbeatIntervalMs);
    await this.checkHealth();
  }

  async stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.balancePoller) {
      clearInterval(this.balancePoller);
    }
    this.pricePoller.stop();
    if (this.pythPriceService) {
      await this.pythPriceService.stop();
    }
    if (this.perpsPoller) {
      await this.perpsPoller.stop();
    }
    if (this.perpsRegistry) {
      await this.perpsRegistry.stop();
    }
    if (this.helius) {
      await this.helius.stop();
    }
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
      if (event.kind === "perps_market") {
        await this.publisher.publishEvent(CHANNELS.perpsMarket(event.market), event);
        await this.publisher.setCache(CACHE_KEYS.perpsMarket(event.market), event);
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
