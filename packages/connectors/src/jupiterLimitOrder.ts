import type {
  CancelAllIntent,
  CancelLimitOrderIntent,
  PlaceLimitOrderIntent,
  ReplaceLimitOrderIntent
} from "@zero/core";
import type { ExecutionConnector, ExecutionResult, OpenOrder, ReconcileResult } from "./types";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";
import { fetch, type Response } from "undici";

export interface JupiterLimitOrderConfig {
  rpcUrl: string;
  privateKey: string;
  cluster?: Cluster;
  apiUrl?: string;
  apiKey?: string;
  computeUnitPrice?: "auto" | string;
}

type Cluster = "mainnet-beta" | "devnet" | "localnet";

type TokenInfo = {
  symbol: string;
  mint: string;
  decimals: number;
};

type CreateOrderResponse = {
  order: string;
  transaction: string;
  requestId?: string;
};

type CancelOrderResponse = {
  transaction: string;
  requestId?: string;
};

type CancelOrdersResponse = {
  transactions: string[];
  requestId?: string;
};

type TriggerOrder = {
  order?: string;
  orderId?: string;
  id?: string;
  publicKey?: string;
  inputMint?: string;
  outputMint?: string;
  makingAmount?: string;
  takingAmount?: string;
  remainingMakingAmount?: string;
  remainingTakingAmount?: string;
  orderStatus?: string;
  status?: string;
};

const TOKEN_REGISTRY: Record<Cluster, Record<string, TokenInfo>> = {
  "mainnet-beta": {
    SOL: { symbol: "SOL", mint: "So11111111111111111111111111111111111111112", decimals: 9 },
    USDC: { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
    USDT: { symbol: "USDT", mint: "Es9vMFrzaCER1a6c7fggkP6yqoCqkf9rD8qt4V9rW", decimals: 6 }
  },
  devnet: {
    SOL: { symbol: "SOL", mint: "So11111111111111111111111111111111111111112", decimals: 9 },
    USDC: { symbol: "USDC", mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", decimals: 6 }
  },
  localnet: {
    SOL: { symbol: "SOL", mint: "So11111111111111111111111111111111111111112", decimals: 9 }
  }
};

const TEN = new BN(10);

export class JupiterLimitOrderConnector implements ExecutionConnector {
  venue = "jupiter";
  private connection: Connection;
  private owner: Keypair;
  private tokens: Record<string, TokenInfo>;
  private tokensByMint: Record<string, TokenInfo>;
  private quoteSymbols: Set<string>;
  private apiUrl: string;
  private apiKey?: string;
  private computeUnitPrice: "auto" | string;

  constructor(private config: JupiterLimitOrderConfig) {
    const cluster = config.cluster ?? "mainnet-beta";
    this.tokens = TOKEN_REGISTRY[cluster] ?? TOKEN_REGISTRY["mainnet-beta"];
    this.tokensByMint = Object.values(this.tokens).reduce<Record<string, TokenInfo>>((acc, token) => {
      acc[token.mint] = token;
      return acc;
    }, {});
    this.quoteSymbols = new Set(["USDC", "USDT"]);
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.owner = parseKeypair(config.privateKey);
    this.apiUrl = (config.apiUrl ?? "https://api.jup.ag/trigger/v1").replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.computeUnitPrice = config.computeUnitPrice ?? "auto";
  }

  async placeLimitOrder(intent: PlaceLimitOrderIntent): Promise<ExecutionResult> {
    let mintDebug:
      | {
          symbol: string;
          side: string;
          inputMint: string;
          outputMint: string;
          inAmount: string;
          outAmount: string;
        }
      | undefined;
    try {
      const { base, quote } = parseSymbol(intent.symbol);
      const baseToken = getToken(this.tokens, base);
      const quoteToken = getToken(this.tokens, quote);
      const { inputMint, outputMint, inAmount, outAmount } = buildOrderAmounts(
        intent,
        baseToken,
        quoteToken
      );
      mintDebug = {
        symbol: intent.symbol,
        side: intent.side,
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        inAmount: inAmount.toString(),
        outAmount: outAmount.toString()
      };
      const response = await this.postJson<CreateOrderResponse>("/createOrder", {
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        maker: this.owner.publicKey.toBase58(),
        payer: this.owner.publicKey.toBase58(),
        params: {
          makingAmount: inAmount.toString(),
          takingAmount: outAmount.toString()
        },
        computeUnitPrice: this.computeUnitPrice
      });
      await this.signAndSendTransaction(response.transaction);
      return { ok: true, externalId: response.order };
    } catch (err) {
      console.warn("[jupiter] place order error", {
        symbol: intent.symbol,
        side: intent.side,
        mints: mintDebug,
        error: (err as Error).message
      });
      return { ok: false, error: (err as Error).message };
    }
  }

  async cancelLimitOrder(intent: CancelLimitOrderIntent): Promise<ExecutionResult> {
    try {
      const orderId = intent.externalId ?? intent.orderId;
      const response = await this.postJson<CancelOrderResponse>("/cancelOrder", {
        maker: this.owner.publicKey.toBase58(),
        order: orderId,
        computeUnitPrice: this.computeUnitPrice
      });
      await this.signAndSendTransaction(response.transaction);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async cancelAll(intent: CancelAllIntent): Promise<ExecutionResult> {
    try {
      const openOrders = await this.getOpenOrders(intent.symbol);
      const orderIds = openOrders
        .map((order) => order.externalId ?? order.orderId)
        .filter((orderId): orderId is string => Boolean(orderId));
      if (orderIds.length === 0) {
        return { ok: true };
      }
      const chunks = chunk(orderIds, 10);
      for (const batch of chunks) {
        const response = await this.postJson<CancelOrdersResponse>("/cancelOrders", {
          maker: this.owner.publicKey.toBase58(),
          orders: batch,
          computeUnitPrice: this.computeUnitPrice
        });
        for (const encoded of response.transactions) {
          await this.signAndSendTransaction(encoded);
        }
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async replaceLimitOrder(intent: ReplaceLimitOrderIntent): Promise<ExecutionResult> {
    try {
      const order = await this.fetchOrderById(intent.orderId);
      if (!order) {
        return { ok: false, error: `Order not found: ${intent.orderId}` };
      }
      const inputMint = order.inputMint ?? "";
      const outputMint = order.outputMint ?? "";
      if (!inputMint || !outputMint) {
        return { ok: false, error: `Order mints missing: ${intent.orderId}` };
      }
      const baseToken = resolveBaseToken(this.tokensByMint, this.quoteSymbols, inputMint, outputMint);
      const quoteToken = resolveQuoteToken(this.tokensByMint, this.quoteSymbols, inputMint, outputMint);
      const side = inputMint === baseToken.mint ? "sell" : "buy";
      const cancel = await this.cancelLimitOrder({ ...intent, kind: "cancel_limit_order" });
      if (!cancel.ok) {
        return cancel;
      }
      return this.placeLimitOrder({
        id: intent.id,
        botId: intent.botId,
        kind: "place_limit_order",
        createdAt: intent.createdAt,
        symbol: `${baseToken.symbol}/${quoteToken.symbol}`,
        side,
        price: intent.newPrice,
        size: intent.newSize
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async getOpenOrders(market: string): Promise<OpenOrder[]> {
    const baseQuote = safeParseSymbol(market);
    const orders = await this.fetchTriggerOrders("active");
    const filtered = baseQuote
      ? orders.filter((order) =>
          matchMarket(order, baseQuote, this.tokensByMint, this.quoteSymbols)
        )
      : orders;
    return filtered
      .map((order) =>
        toOpenOrder(order, this.tokensByMint, this.quoteSymbols)
      )
      .filter((order): order is OpenOrder => Boolean(order));
  }

  async reconcile(market: string): Promise<ReconcileResult> {
    const orders = await this.getOpenOrders(market);
    return { ok: true, message: `openOrders=${orders.length}` };
  }

  private async fetchOrderById(orderId: string): Promise<TriggerOrder | null> {
    const orders = await this.fetchTriggerOrders("active");
    return orders.find((order) => extractOrderId(order) === orderId) ?? null;
  }

  private async fetchTriggerOrders(status: "active" | "history" | "all"): Promise<TriggerOrder[]> {
    const url = new URL(`${this.apiUrl}/getTriggerOrders`);
    url.searchParams.set("user", this.owner.publicKey.toBase58());
    if (status && status !== "all") {
      url.searchParams.set("orderStatus", status);
    }
    const payload = await this.getJson<unknown>(url.toString());
    return extractTriggerOrders(payload);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      method: "POST",
      headers: this.buildHeaders(true),
      body: JSON.stringify(body)
    });
    return this.parseResponse<T>(response);
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      method: "GET",
      headers: this.buildHeaders(false)
    });
    return this.parseResponse<T>(response);
  }

  private buildUrl(path: string) {
    if (path.startsWith("http")) {
      return path;
    }
    if (path.startsWith("/")) {
      return `${this.apiUrl}${path}`;
    }
    return `${this.apiUrl}/${path}`;
  }

  private buildHeaders(withJson: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    if (withJson) {
      headers["content-type"] = "application/json";
    }
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }
    return headers;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Jupiter API ${response.status}: ${text}`);
    }
    return (await response.json()) as T;
  }

  private async signAndSendTransaction(encoded: string) {
    const bytes = Buffer.from(encoded, "base64");
    try {
      const tx = VersionedTransaction.deserialize(bytes);
      tx.sign([this.owner]);
      return await this.sendAndConfirm(tx.serialize());
    } catch (err) {
      const legacy = Transaction.from(bytes);
      legacy.partialSign(this.owner);
      return await this.sendAndConfirm(legacy.serialize());
    }
  }

  private async sendAndConfirm(raw: Uint8Array) {
    const signature = await this.connection.sendRawTransaction(raw, {
      skipPreflight: false
    });
    await this.connection.confirmTransaction(signature, "confirmed");
    return signature;
  }
}

function parseKeypair(secret: string): Keypair {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error("SOLANA_PRIVATE_KEY is required for execution");
  }
  if (trimmed.startsWith("[")) {
    const bytes = Uint8Array.from(JSON.parse(trimmed) as number[]);
    return Keypair.fromSecretKey(bytes);
  }
  try {
    const bytes = bs58.decode(trimmed);
    return Keypair.fromSecretKey(bytes);
  } catch (err) {
    throw new Error(`Invalid SOLANA_PRIVATE_KEY format: ${(err as Error).message}`);
  }
}

function parseSymbol(symbol: string): { base: string; quote: string } {
  const parts = symbol.includes("/") ? symbol.split("/") : symbol.split("-");
  const [base, quote] = parts;
  if (!base || !quote || parts.length !== 2) {
    throw new Error(`Invalid symbol: ${symbol}`);
  }
  return { base: base.toUpperCase(), quote: quote.toUpperCase() };
}

function safeParseSymbol(symbol: string): { base: string; quote: string } | null {
  try {
    return parseSymbol(symbol);
  } catch {
    return null;
  }
}

function getToken(tokens: Record<string, TokenInfo>, symbol: string): TokenInfo {
  const token = tokens[symbol.toUpperCase()];
  if (!token) {
    throw new Error(`Unsupported token symbol: ${symbol}`);
  }
  return token;
}

function resolveBaseToken(
  tokensByMint: Record<string, TokenInfo>,
  quoteSymbols: Set<string>,
  inputMint: string,
  outputMint: string
): TokenInfo {
  const inputToken = tokensByMint[inputMint];
  const outputToken = tokensByMint[outputMint];
  if (inputToken && outputToken) {
    if (quoteSymbols.has(inputToken.symbol)) {
      return outputToken;
    }
    if (quoteSymbols.has(outputToken.symbol)) {
      return inputToken;
    }
  }
  return inputToken ?? outputToken ?? { symbol: "UNKNOWN", mint: inputMint, decimals: 6 };
}

function resolveQuoteToken(
  tokensByMint: Record<string, TokenInfo>,
  quoteSymbols: Set<string>,
  inputMint: string,
  outputMint: string
): TokenInfo {
  const inputToken = tokensByMint[inputMint];
  const outputToken = tokensByMint[outputMint];
  if (inputToken && outputToken) {
    if (quoteSymbols.has(inputToken.symbol)) {
      return inputToken;
    }
    if (quoteSymbols.has(outputToken.symbol)) {
      return outputToken;
    }
  }
  return outputToken ?? inputToken ?? { symbol: "UNKNOWN", mint: outputMint, decimals: 6 };
}

function buildOrderAmounts(
  intent: PlaceLimitOrderIntent,
  baseToken: TokenInfo,
  quoteToken: TokenInfo
) {
  const sizeBase = decimalToBn(intent.size, baseToken.decimals);
  const priceQuote = decimalToBn(intent.price, quoteToken.decimals);
  const quoteAmount = sizeBase.mul(priceQuote).div(TEN.pow(new BN(baseToken.decimals)));
  if (intent.side === "buy") {
    return {
      inputMint: new PublicKey(quoteToken.mint),
      outputMint: new PublicKey(baseToken.mint),
      inAmount: quoteAmount,
      outAmount: sizeBase
    };
  }
  return {
    inputMint: new PublicKey(baseToken.mint),
    outputMint: new PublicKey(quoteToken.mint),
    inAmount: sizeBase,
    outAmount: quoteAmount
  };
}

function decimalToBn(value: string, decimals: number) {
  const [whole, fraction = ""] = value.split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  const normalized = `${whole || "0"}${padded}`.replace(/^0+(?=\d)/, "");
  return new BN(normalized || "0");
}

function formatAmount(amount: BN, decimals: number) {
  const raw = amount.toString().padStart(decimals + 1, "0");
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

function extractTriggerOrders(payload: unknown): TriggerOrder[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload as TriggerOrder[];
  }
  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.orders)) {
      return record.orders as TriggerOrder[];
    }
    if (Array.isArray(record.data)) {
      return record.data as TriggerOrder[];
    }
  }
  return [];
}

function extractOrderId(order: TriggerOrder): string | null {
  return order.order ?? order.orderId ?? order.id ?? order.publicKey ?? null;
}

function matchMarket(
  order: TriggerOrder,
  baseQuote: { base: string; quote: string },
  tokensByMint: Record<string, TokenInfo>,
  quoteSymbols: Set<string>
) {
  const inputMint = order.inputMint;
  const outputMint = order.outputMint;
  if (!inputMint || !outputMint) {
    return false;
  }
  const baseToken = resolveBaseToken(tokensByMint, quoteSymbols, inputMint, outputMint);
  const quoteToken = resolveQuoteToken(tokensByMint, quoteSymbols, inputMint, outputMint);
  return (
    baseToken.symbol.toUpperCase() === baseQuote.base.toUpperCase() &&
    quoteToken.symbol.toUpperCase() === baseQuote.quote.toUpperCase()
  );
}

function toOpenOrder(
  order: TriggerOrder,
  tokensByMint: Record<string, TokenInfo>,
  quoteSymbols: Set<string>
): OpenOrder | null {
  const orderId = extractOrderId(order);
  const inputMint = order.inputMint;
  const outputMint = order.outputMint;
  if (!orderId || !inputMint || !outputMint) {
    return null;
  }
  const baseToken = resolveBaseToken(tokensByMint, quoteSymbols, inputMint, outputMint);
  const quoteToken = resolveQuoteToken(tokensByMint, quoteSymbols, inputMint, outputMint);
  const side = inputMint === baseToken.mint ? "sell" : "buy";

  const originalMaking = toBn(order.makingAmount);
  const originalTaking = toBn(order.takingAmount);
  const remainingMaking = toBn(order.remainingMakingAmount ?? order.makingAmount);
  const remainingTaking = toBn(order.remainingTakingAmount ?? order.takingAmount);
  if (!remainingMaking || !remainingTaking || remainingMaking.isZero() || remainingTaking.isZero()) {
    return null;
  }

  const sizeBase = side === "sell" ? remainingMaking : remainingTaking;
  const priceBn =
    side === "sell"
      ? remainingTaking.mul(TEN.pow(new BN(baseToken.decimals))).div(remainingMaking)
      : remainingMaking.mul(TEN.pow(new BN(baseToken.decimals))).div(remainingTaking);

  let status: OpenOrder["status"] = "open";
  const statusRaw = `${order.orderStatus ?? order.status ?? ""}`.toLowerCase();
  if (statusRaw.includes("fill")) {
    status = "filled";
  } else if (statusRaw.includes("cancel")) {
    status = "canceled";
  } else if (originalMaking && originalTaking) {
    if (remainingMaking.lt(originalMaking) || remainingTaking.lt(originalTaking)) {
      status = "partial";
    }
  }

  return {
    orderId,
    externalId: orderId,
    side,
    price: formatAmount(priceBn, quoteToken.decimals),
    size: formatAmount(sizeBase, baseToken.decimals),
    status
  };
}

function toBn(value?: string): BN | null {
  if (!value) {
    return null;
  }
  try {
    return new BN(value);
  } catch {
    return null;
  }
}
