export interface MarketDataConfig {
  port: number;
  host: string;
  redisUrl: string;
  heliusWsUrl: string;
  heliusHttpUrl: string;
  walletPubkey: string;
  commitment: "processed" | "confirmed" | "finalized";
  heartbeatIntervalMs: number;
  staleSeconds: number;
  pricePollIntervalMs: number;
  priceSymbols: string[];
  jupiterPriceUrl: string;
}

function required(name: string, value?: string): string {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function loadConfig(env = process.env): MarketDataConfig {
  const apiKey = env.HELIUS_API_KEY;
  const heliusWsUrl =
    env.HELIUS_WS_URL ??
    (apiKey ? `wss://mainnet.helius-rpc.com/?api-key=${apiKey}` : undefined);
  const heliusHttpUrl =
    env.HELIUS_HTTP_URL ??
    (apiKey ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}` : undefined);

  return {
    port: Number(env.PORT ?? 3002),
    host: env.HOST ?? "0.0.0.0",
    redisUrl: required("REDIS_URL", env.REDIS_URL),
    heliusWsUrl: required("HELIUS_WS_URL", heliusWsUrl),
    heliusHttpUrl: required("HELIUS_HTTP_URL", heliusHttpUrl),
    walletPubkey: required("BOT_WALLET_PUBKEY", env.BOT_WALLET_PUBKEY),
    commitment: (env.HELIUS_COMMITMENT ?? "confirmed") as
      | "processed"
      | "confirmed"
      | "finalized",
    heartbeatIntervalMs: Number(env.HEARTBEAT_INTERVAL_MS ?? 5000),
    staleSeconds: Number(env.STALE_SECONDS ?? 30),
    pricePollIntervalMs: Number(env.PRICE_POLL_INTERVAL_MS ?? 15000),
    priceSymbols: (env.PRICE_POLL_SYMBOLS ?? "SOL")
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean),
    jupiterPriceUrl: env.JUPITER_PRICE_URL ?? "https://price.jup.ag/v6/price"
  };
}
