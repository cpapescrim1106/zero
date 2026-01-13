import type { EventVersion } from "./events";

export type ServiceName = "api" | "web" | "market-data" | "bot-runner";

export interface RedisEnvelope<T> {
  version: EventVersion;
  ts: string;
  kind: string;
  data: T;
}

export const CHANNELS = {
  price: (symbol: string) => `md:price:${symbol}`,
  perpsMarket: (market: string) => `md:perps:${market}`,
  walletBalances: (walletId: string) => `md:wallet:${walletId}:balances`,
  walletTx: (walletId: string) => `md:tx:${walletId}`,
  botCmd: (botId: string) => `cmd:bot:${botId}`,
  botEvt: (botId: string) => `evt:bot:${botId}`,
  health: (service: ServiceName) => `health:${service}`
};

export const CACHE_KEYS = {
  price: (symbol: string) => `state:price:${symbol}`,
  perpsMarket: (market: string) => `state:perps:${market}`,
  bot: (botId: string) => `state:bot:${botId}`,
  health: (service: ServiceName) => `state:health:${service}`,
  walletBalances: (walletId: string) => `state:wallet:${walletId}:balances`
};
