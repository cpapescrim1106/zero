import { randomUUID } from "crypto";
import WebSocket, { type RawData } from "ws";
import type { BalanceEvent, NormalizedEvent, WalletTxEvent } from "@zero/core";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SOL_MINT = "SOL";
const SOL_DECIMALS = 9;

interface HeliusProviderOptions {
  wsUrl: string;
  httpUrl: string;
  walletPubkey: string;
  commitment: "processed" | "confirmed" | "finalized";
  onEvent: (event: NormalizedEvent) => void;
  onLog?: (message: string, context?: Record<string, unknown>) => void;
}

type RpcSubscriptionCallback = (payload: unknown, context?: { slot?: number }) => void;

interface SubscriptionMeta {
  accountPubkey?: string;
  callback: RpcSubscriptionCallback;
}

class RpcWebSocket {
  private ws?: WebSocket;
  private nextId = 1;
  private inflight = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
  private subscriptions = new Map<number, SubscriptionMeta>();

  constructor(
    private url: string,
    private log?: HeliusProviderOptions["onLog"],
    private onClose?: () => void
  ) {}

  async connect() {
    if (this.ws) {
      return;
    }
    this.ws = new WebSocket(this.url);
    await new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error("WebSocket not initialized"));
        return;
      }
      this.ws.on("open", () => resolve());
      this.ws.on("error", (err: Error) => reject(err));
    });
    this.ws.on("message", (data: RawData) => this.handleMessage(data.toString()));
    this.ws.on("error", (err: Error) => this.log?.("ws error", { error: err.message }));
    this.ws.on("close", () => this.handleClose());
  }

  async close() {
    if (!this.ws) {
      return;
    }
    this.ws.close();
    this.ws = undefined;
  }

  async request(method: string, params: unknown[]): Promise<unknown> {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    const message = JSON.stringify(payload);
    if (!this.ws) {
      throw new Error("WebSocket not connected");
    }
    const response = new Promise<unknown>((resolve, reject) => {
      this.inflight.set(id, { resolve, reject });
      this.ws?.send(message, (err?: Error) => {
        if (err) {
          this.inflight.delete(id);
          reject(err);
        }
      });
    });
    return response;
  }

  async subscribe(method: string, params: unknown[], meta: SubscriptionMeta): Promise<number> {
    const result = await this.request(method, params);
    if (typeof result !== "number") {
      throw new Error(`Unexpected subscription result for ${method}`);
    }
    this.subscriptions.set(result, meta);
    return result;
  }

  private handleMessage(raw: string) {
    const message = JSON.parse(raw);
    if (message.id && this.inflight.has(message.id)) {
      const handler = this.inflight.get(message.id);
      this.inflight.delete(message.id);
      if (message.error) {
        handler?.reject(new Error(message.error.message ?? "RPC error"));
      } else {
        handler?.resolve(message.result);
      }
      return;
    }
    const params = message.params;
    if (!params?.subscription) {
      return;
    }
    const subscription = this.subscriptions.get(params.subscription);
    if (!subscription) {
      return;
    }
    const context = params.result?.context ?? {};
    subscription.callback(params.result?.value ?? params.result, { slot: context.slot });
  }

  private handleClose() {
    this.log?.("ws closed");
    this.onClose?.();
  }
}

export class HeliusProvider {
  private client: RpcWebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private accountBalances = new Map<string, { mint: string; amount: bigint; decimals: number }>();
  private mintTotals = new Map<string, { amount: bigint; decimals: number }>();
  private tokenAccountSubscriptions = new Set<string>();

  constructor(private options: HeliusProviderOptions) {
    this.client = new RpcWebSocket(options.wsUrl, options.onLog, () => this.scheduleReconnect());
  }

  async start() {
    await this.connectAndSubscribe();
  }

  async stop() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    await this.client.close();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectAndSubscribe();
    }, 2000);
  }

  private async connectAndSubscribe() {
    try {
      await this.client.connect();
      this.tokenAccountSubscriptions.clear();
      await this.subscribeLogs();
      await this.subscribeWalletAccount();
      await this.subscribeTokenAccounts();
      this.options.onLog?.("helius subscriptions established");
    } catch (err) {
      this.options.onLog?.("helius connection failed", { error: (err as Error).message });
      this.scheduleReconnect();
    }
  }

  private async subscribeLogs() {
    await this.client.subscribe(
      "logsSubscribe",
      [
        { mentions: [this.options.walletPubkey] },
        { commitment: this.options.commitment }
      ],
      {
        callback: (payload, context) => this.handleLogNotification(payload, context?.slot)
      }
    );
  }

  private async subscribeWalletAccount() {
    await this.client.subscribe(
      "accountSubscribe",
      [this.options.walletPubkey, { encoding: "jsonParsed", commitment: this.options.commitment }],
      {
        accountPubkey: this.options.walletPubkey,
        callback: (payload, context) => this.handleWalletAccount(payload, context?.slot)
      }
    );
  }

  private async subscribeTokenAccounts() {
    const accounts = await this.fetchTokenAccounts();
    for (const account of accounts) {
      if (this.tokenAccountSubscriptions.has(account.pubkey)) {
        continue;
      }
      this.tokenAccountSubscriptions.add(account.pubkey);
      this.recordTokenAccountBalance(account.pubkey, account.mint, account.amount, account.decimals);
      await this.client.subscribe(
        "accountSubscribe",
        [account.pubkey, { encoding: "jsonParsed", commitment: this.options.commitment }],
        {
          accountPubkey: account.pubkey,
          callback: (payload, context) =>
            this.handleTokenAccount(account.pubkey, payload, context?.slot)
        }
      );
    }
  }

  private async fetchTokenAccounts() {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        this.options.walletPubkey,
        { programId: TOKEN_PROGRAM_ID },
        { encoding: "jsonParsed" }
      ]
    };
    const response = await fetch(this.options.httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error("Failed to fetch token accounts");
    }
    const payload = (await response.json()) as { result?: { value?: any[] } };
    const accounts = payload?.result?.value ?? [];
    return accounts
      .map((entry: any) => {
        const info = entry?.account?.data?.parsed?.info;
        const tokenAmount = info?.tokenAmount;
        if (!info?.mint || !tokenAmount?.amount) {
          return null;
        }
        return {
          pubkey: entry.pubkey,
          mint: info.mint,
          amount: BigInt(tokenAmount.amount),
          decimals: Number(tokenAmount.decimals ?? 0)
        };
      })
      .filter(Boolean) as Array<{ pubkey: string; mint: string; amount: bigint; decimals: number }>;
  }

  private handleLogNotification(payload: any, slot?: number) {
    const signature = payload?.signature;
    if (!signature) {
      return;
    }
    const status = payload?.err ? "failed" : "confirmed";
    const event: WalletTxEvent = {
      id: randomUUID(),
      version: "v1",
      kind: "wallet_tx",
      ts: new Date().toISOString(),
      source: "helius",
      walletId: this.options.walletPubkey,
      signature,
      status,
      slot
    };
    this.options.onEvent(event);
  }

  private handleWalletAccount(payload: any, slot?: number) {
    const lamports = payload?.lamports;
    if (typeof lamports !== "number") {
      return;
    }
    this.recordTokenAccountBalance(
      this.options.walletPubkey,
      SOL_MINT,
      BigInt(lamports),
      SOL_DECIMALS,
      slot
    );
  }

  private handleTokenAccount(accountPubkey: string, payload: any, slot?: number) {
    const parsed = payload?.data?.parsed;
    const info = parsed?.info;
    const tokenAmount = info?.tokenAmount;
    if (!info?.mint || !tokenAmount?.amount) {
      return;
    }
    this.recordTokenAccountBalance(
      accountPubkey,
      info.mint,
      BigInt(tokenAmount.amount),
      Number(tokenAmount.decimals ?? 0),
      slot
    );
  }

  private recordTokenAccountBalance(
    accountPubkey: string,
    mint: string,
    amount: bigint,
    decimals: number,
    slot?: number
  ) {
    const previousAccount = this.accountBalances.get(accountPubkey);
    if (previousAccount) {
      const total = this.mintTotals.get(previousAccount.mint);
      if (total) {
        total.amount -= previousAccount.amount;
      }
    }

    const beforeTotal = this.mintTotals.get(mint)?.amount ?? 0n;
    const mintTotal = this.mintTotals.get(mint);
    if (mintTotal) {
      mintTotal.amount += amount;
    } else {
      this.mintTotals.set(mint, { amount, decimals });
    }
    this.accountBalances.set(accountPubkey, { mint, amount, decimals });

    const afterTotal = this.mintTotals.get(mint)?.amount ?? 0n;
    const balance = formatAmount(afterTotal, decimals);
    const deltaAmount = afterTotal - beforeTotal;

    const event: BalanceEvent = {
      id: randomUUID(),
      version: "v1",
      kind: "balance",
      ts: new Date().toISOString(),
      source: "helius",
      walletId: this.options.walletPubkey,
      tokenMint: mint,
      balance,
      delta: beforeTotal === 0n ? undefined : formatAmount(deltaAmount, decimals),
      slot
    };
    this.options.onEvent(event);
  }
}

function formatAmount(amount: bigint, decimals: number): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const raw = abs.toString().padStart(decimals + 1, "0");
  const whole = decimals === 0 ? raw : raw.slice(0, -decimals);
  const fraction = decimals === 0 ? "" : raw.slice(-decimals).replace(/0+$/, "");
  const value = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${value}` : value;
}
