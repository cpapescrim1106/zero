import { randomUUID } from "crypto";
import { Connection, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import * as DriftSdk from "@drift-labs/sdk";
import type { NormalizedEvent, PerpsMarketEvent } from "@zero/core";

export interface DriftPerpsPollerConfig {
  rpcUrl: string;
  env: "mainnet-beta" | "devnet";
  pollIntervalMs: number;
  onEvent: (event: NormalizedEvent) => void | Promise<void>;
}

const PRICE_PRECISION = new BN(1_000_000);
const FUNDING_PRECISION = new BN(1_000_000_000);

export class DriftPerpsPoller {
  private drift: any;
  private marketIndexBySymbol = new Map<string, number>();
  private activeMarkets = new Set<string>();
  private pollTimer?: NodeJS.Timeout;

  constructor(private config: DriftPerpsPollerConfig) {
    const connection = new Connection(config.rpcUrl, "confirmed");
    const wallet = new DriftSdk.Wallet(Keypair.generate());
    this.drift = new DriftSdk.DriftClient({
      connection,
      wallet,
      env: config.env,
      accountSubscription: { type: "polling" }
    });
  }

  async start() {
    await this.drift.subscribe();
    await this.refreshMarketIndexMap();
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.config.pollIntervalMs);
    await this.poll();
  }

  async stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    if (this.drift?.unsubscribe) {
      await this.drift.unsubscribe();
    }
  }

  setMarkets(markets: string[]) {
    this.activeMarkets = new Set(markets.map((market) => normalizePerpsSymbol(market)));
  }

  private async refreshMarketIndexMap() {
    const markets = (this.drift.getPerpMarketAccounts?.() ?? []) as Array<{
      name?: number[];
      marketIndex?: number;
    }>;
    for (const market of markets) {
      const name = decodeName(market.name);
      if (name && typeof market.marketIndex === "number") {
        this.marketIndexBySymbol.set(name, market.marketIndex);
      }
    }
  }

  private async poll() {
    if (this.activeMarkets.size === 0) {
      return;
    }
    await this.refreshMarketIndexMap();
    for (const market of this.activeMarkets) {
      const marketIndex = this.marketIndexBySymbol.get(market);
      if (marketIndex === undefined) {
        continue;
      }
      const marketAccount = this.drift.getPerpMarketAccount?.(marketIndex) as any;
      if (!marketAccount) {
        continue;
      }
      const mark = toDecimal(
        marketAccount.amm?.lastMarkPrice ??
          marketAccount.amm?.markPrice ??
          marketAccount.lastMarkPrice,
        PRICE_PRECISION
      );
      const fundingRate = toDecimal(
        marketAccount.amm?.lastFundingRate ?? marketAccount.amm?.lastFundingRateLong,
        FUNDING_PRECISION
      );
      const nextFundingTime = marketAccount.amm?.nextFundingTime
        ? new Date(Number(marketAccount.amm.nextFundingTime) * 1000).toISOString()
        : undefined;
      const oraclePrice = await this.fetchOraclePrice(marketIndex);
      const divergenceBps = computeDivergenceBps(mark, oraclePrice);

      const event: PerpsMarketEvent = {
        id: randomUUID(),
        version: "v1",
        kind: "perps_market",
        ts: new Date().toISOString(),
        source: "drift",
        market,
        markPrice: mark,
        oraclePrice,
        fundingRate,
        nextFundingTime,
        markOracleDivergenceBps: divergenceBps ?? undefined
      };
      await this.config.onEvent(event);
    }
  }

  private async fetchOraclePrice(marketIndex: number) {
    if (typeof this.drift.getOracleDataForPerpMarket !== "function") {
      return undefined;
    }
    const oracle = await this.drift.getOracleDataForPerpMarket(marketIndex);
    return toDecimal(oracle?.price ?? oracle?.data?.price, PRICE_PRECISION);
  }
}

function toDecimal(value: BN | number | undefined, precision: BN) {
  if (!value) {
    return undefined;
  }
  const raw = BN.isBN(value) ? value.toNumber() : Number(value);
  if (!Number.isFinite(raw)) {
    return undefined;
  }
  return (raw / precision.toNumber()).toFixed(6);
}

function computeDivergenceBps(mark?: string, oracle?: string) {
  if (!mark || !oracle) {
    return null;
  }
  const markNum = Number(mark);
  const oracleNum = Number(oracle);
  if (!Number.isFinite(markNum) || !Number.isFinite(oracleNum) || oracleNum === 0) {
    return null;
  }
  return Math.abs((markNum - oracleNum) / oracleNum) * 10_000;
}

function normalizePerpsSymbol(symbol: string) {
  const trimmed = symbol.trim().toUpperCase();
  if (trimmed.includes("-PERP")) {
    return trimmed;
  }
  if (trimmed.includes("/")) {
    const base = trimmed.split("/")[0]?.trim() ?? trimmed;
    return `${base}-PERP`;
  }
  return `${trimmed}-PERP`;
}

function decodeName(name?: number[]) {
  if (!name) {
    return "";
  }
  return Buffer.from(name).toString("utf8").replace(/\0/g, "");
}
