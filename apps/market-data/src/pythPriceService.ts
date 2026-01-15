import { randomUUID } from "crypto";
import type { PriceEvent } from "@zero/core";
import WebSocket from "ws";

type PythPriceServiceOptions = {
  httpUrl: string;
  wsUrl: string;
  symbols: string[];
  onEvent: (event: PriceEvent) => void;
  onLog?: (message: string, context?: Record<string, unknown>) => void;
};

type PriceFeedRecord = {
  id: string;
  attributes?: {
    symbol?: string;
    base?: string;
    quote_currency?: string;
  };
};

type PriceUpdateMessage = {
  type?: string;
  price_feed?: {
    id?: string;
    price?: {
      price?: string;
      expo?: number;
      publish_time?: number;
    };
  };
};

export class PythPriceService {
  private socket?: WebSocket;
  private symbolById = new Map<string, string>();
  private ids: string[] = [];
  private stopped = false;

  constructor(private options: PythPriceServiceOptions) {}

  async start() {
    this.stopped = false;
    await this.loadPriceFeedIds();
    if (this.ids.length === 0) {
      this.options.onLog?.("pyth disabled: no feed ids resolved");
      return;
    }
    this.connect();
  }

  async stop() {
    this.stopped = true;
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }
  }

  private async loadPriceFeedIds() {
    const ids: string[] = [];
    for (const symbol of this.options.symbols) {
      const query = encodeURIComponent(`Crypto.${symbol.toUpperCase()}/USD`);
      const url = `${this.options.httpUrl}/v2/price_feeds?query=${query}`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          this.options.onLog?.("pyth feed lookup failed", { symbol, status: response.status });
          continue;
        }
        const payload = (await response.json()) as PriceFeedRecord[];
        const record = Array.isArray(payload) ? payload[0] : undefined;
        if (!record?.id) {
          this.options.onLog?.("pyth feed missing", { symbol });
          continue;
        }
        ids.push(record.id);
        this.symbolById.set(record.id, symbol.toUpperCase());
      } catch (err) {
        this.options.onLog?.("pyth feed lookup error", { symbol, error: (err as Error).message });
      }
    }
    this.ids = ids;
  }

  private connect() {
    if (this.stopped) {
      return;
    }
    this.socket = new WebSocket(this.options.wsUrl);
    this.socket.on("open", () => {
      this.options.onLog?.("pyth ws connected");
      this.socket?.send(
        JSON.stringify({ type: "subscribe", ids: this.ids, verbose: true })
      );
    });
    this.socket.on("message", (data) => {
      this.handleMessage(data.toString());
    });
    this.socket.on("close", () => {
      this.options.onLog?.("pyth ws closed");
      if (!this.stopped) {
        setTimeout(() => this.connect(), 2000);
      }
    });
    this.socket.on("error", (err) => {
      this.options.onLog?.("pyth ws error", { error: (err as Error).message });
    });
  }

  private handleMessage(raw: string) {
    let payload: PriceUpdateMessage;
    try {
      payload = JSON.parse(raw) as PriceUpdateMessage;
    } catch {
      return;
    }
    if (payload.type !== "price_update") {
      return;
    }
    const feed = payload.price_feed;
    const id = feed?.id;
    const price = feed?.price?.price;
    const expo = feed?.price?.expo;
    const publishTime = feed?.price?.publish_time;
    if (!id || price === undefined || expo === undefined || publishTime === undefined) {
      return;
    }
    const symbol = this.symbolById.get(id);
    if (!symbol) {
      return;
    }
    const numericPrice = Number(price) * Math.pow(10, expo);
    if (!Number.isFinite(numericPrice)) {
      return;
    }
    const event: PriceEvent = {
      id: randomUUID(),
      version: "v1",
      kind: "price",
      ts: new Date(publishTime * 1000).toISOString(),
      source: "pyth",
      symbol,
      price: numericPrice.toFixed(6)
    };
    this.options.onEvent(event);
  }
}
