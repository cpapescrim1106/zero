import type {
  CancelAllIntent,
  CancelLimitOrderIntent,
  PlaceLimitOrderIntent,
  ReplaceLimitOrderIntent
} from "@zero/core";
import type { ExecutionConnector, ExecutionResult, OpenOrder, ReconcileResult } from "./types";
import { Connection, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";
import * as DriftSdk from "@drift-labs/sdk";

export interface DriftPerpsConfig {
  rpcUrl: string;
  privateKey: string;
  env: "mainnet-beta" | "devnet";
  subaccountId: number;
}

const PRICE_PRECISION = new BN(1_000_000);
const BASE_PRECISION = new BN(1_000_000_000);

export class DriftPerpsConnector implements ExecutionConnector {
  venue = "drift_perps";
  private drift: any;
  private user: any;
  private ready: Promise<void>;

  constructor(private config: DriftPerpsConfig) {
    const connection = new Connection(config.rpcUrl, "confirmed");
    const wallet = new DriftSdk.Wallet(parseKeypair(config.privateKey));
    this.drift = new DriftSdk.DriftClient({
      connection,
      wallet,
      env: config.env,
      accountSubscription: { type: "websocket" }
    });
    this.ready = this.init();
  }

  private async init() {
    await this.drift.subscribe();
    this.user = this.drift.getUser(this.config.subaccountId);
    if (!this.user) {
      await this.drift.addUser(this.config.subaccountId);
      this.user = this.drift.getUser(this.config.subaccountId);
    }
  }

  private async ensureReady() {
    await this.ready;
    if (!this.user) {
      this.user = this.drift.getUser(this.config.subaccountId);
    }
  }

  async placeLimitOrder(intent: PlaceLimitOrderIntent): Promise<ExecutionResult> {
    try {
      await this.ensureReady();
      const marketIndex = this.resolveMarketIndex(intent.symbol);
      const direction =
        intent.side === "buy" ? DriftSdk.PositionDirection.LONG : DriftSdk.PositionDirection.SHORT;
      const price = toPrecision(intent.price, PRICE_PRECISION);
      const baseAmount = toPrecision(intent.size, BASE_PRECISION);
      const result = await this.drift.placePerpOrder({
        marketIndex,
        direction,
        price,
        baseAssetAmount: baseAmount,
        orderType: DriftSdk.OrderType.LIMIT,
        reduceOnly: intent.reduceOnly ?? false,
        postOnly: true
      });
      const externalId = typeof result === "string" ? result : result?.txSig ?? undefined;
      return { ok: true, externalId };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async cancelLimitOrder(intent: CancelLimitOrderIntent): Promise<ExecutionResult> {
    try {
      await this.ensureReady();
      const orderId = intent.externalId ?? intent.orderId;
      await this.drift.cancelOrder(orderId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async cancelAll(intent: CancelAllIntent): Promise<ExecutionResult> {
    try {
      await this.ensureReady();
      const marketIndex = this.resolveMarketIndex(intent.symbol);
      if (typeof this.drift.cancelOrdersByMarketIndex === "function") {
        await this.drift.cancelOrdersByMarketIndex(marketIndex);
      } else {
        await this.drift.cancelOrders();
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async replaceLimitOrder(intent: ReplaceLimitOrderIntent): Promise<ExecutionResult> {
    try {
      await this.ensureReady();
      await this.drift.cancelOrder(intent.orderId);
      return { ok: false, error: "replace_limit_order is not supported for drift perps yet" };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async getOpenOrders(market: string): Promise<OpenOrder[]> {
    await this.ensureReady();
    if (!this.user) {
      return [];
    }
    const orders = this.user.getOpenOrders?.() ?? [];
    return orders
      .map((order: any) => ({
        orderId: String(order.orderId ?? order.id),
        externalId: order.orderId ? String(order.orderId) : undefined,
        side: order.direction === DriftSdk.PositionDirection.LONG ? "buy" : "sell",
        price: fromPrecision(order.price, PRICE_PRECISION),
        size: fromPrecision(order.baseAssetAmount, BASE_PRECISION),
        status: "open"
      }))
      .filter((order: OpenOrder) => order.orderId && order.price !== "0");
  }

  async reconcile(_market: string): Promise<ReconcileResult> {
    await this.ensureReady();
    return { ok: true };
  }

  private resolveMarketIndex(symbol: string): number {
    const normalized = normalizePerpSymbol(symbol);
    const markets = (this.drift.getPerpMarketAccounts?.() ?? []) as Array<{
      name?: number[];
      marketIndex?: number;
    }>;
    for (const market of markets) {
      const name = decodeName(market.name);
      if (name === normalized && typeof market.marketIndex === "number") {
        return market.marketIndex;
      }
    }
    throw new Error(`Unknown perps market: ${symbol}`);
  }
}

function parseKeypair(value: string): Keypair {
  const raw = value.trim();
  if (raw.startsWith("[")) {
    const bytes = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }
  return Keypair.fromSecretKey(bs58.decode(raw));
}

function toPrecision(value: string, precision: BN) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  const scaled = Math.round(numeric * precision.toNumber());
  return new BN(scaled);
}

function fromPrecision(value: BN, precision: BN) {
  const numeric = value.toNumber() / precision.toNumber();
  return numeric.toFixed(6);
}

function normalizePerpSymbol(symbol: string) {
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
