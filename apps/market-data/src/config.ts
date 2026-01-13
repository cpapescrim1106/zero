export interface MarketDataConfig {
  port: number;
  host: string;
  redisUrl: string;
  solanaRpcUrl: string;
  driftEnv: "mainnet-beta" | "devnet";
  heliusEnabled: boolean;
  heliusWsUrl?: string;
  heliusHttpUrl?: string;
  walletPubkey?: string;
  commitment: "processed" | "confirmed" | "finalized";
  heliusSubscribeLogs: boolean;
  heliusSubscribeWallet: boolean;
  heliusSubscribeTokens: boolean;
  heliusTokenMintAllowlist?: string[];
  heartbeatIntervalMs: number;
  staleSeconds: number;
  pricePollIntervalMs: number;
  priceSymbols: string[];
  jupiterPriceUrl: string;
  priceSource: "jupiter" | "coingecko" | "kraken";
  coingeckoPriceUrl: string;
  perpsEnabled: boolean;
  perpsMarkets: string[];
  perpsPollIntervalMs: number;
}

function required(name: string, value?: string): string {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function parseBool(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }
  return value === "true" || value === "1";
}

function parseCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env): MarketDataConfig {
  const apiKey = env.HELIUS_API_KEY;
  const heliusEnabled = env.HELIUS_DISABLED !== "true" && env.HELIUS_DISABLED !== "1";
  const heliusWsUrl =
    env.HELIUS_WS_URL ??
    (apiKey ? `wss://mainnet.helius-rpc.com/?api-key=${apiKey}` : undefined);
  const heliusHttpUrl =
    env.HELIUS_HTTP_URL ??
    (apiKey ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}` : undefined);

  if (heliusEnabled && (!heliusWsUrl || !heliusHttpUrl)) {
    throw new Error("Missing required env: HELIUS_WS_URL or HELIUS_HTTP_URL");
  }

  const heliusTokenMintAllowlist = parseCsv(env.HELIUS_TOKEN_MINTS);
  const perpsEnabled = parseBool(env.PERPS_ENABLED, true);
  const perpsMarkets = parseCsv(env.PERPS_MARKETS);

  return {
    port: Number(env.PORT ?? 3002),
    host: env.HOST ?? "0.0.0.0",
    redisUrl: required("REDIS_URL", env.REDIS_URL),
    solanaRpcUrl:
      env.SOLANA_RPC_URL ??
      heliusHttpUrl ??
      "https://api.mainnet-beta.solana.com",
    driftEnv: (env.DRIFT_ENV ?? env.SOLANA_CLUSTER ?? "mainnet-beta") as "mainnet-beta" | "devnet",
    heliusEnabled,
    heliusWsUrl,
    heliusHttpUrl,
    walletPubkey: heliusEnabled ? required("BOT_WALLET_PUBKEY", env.BOT_WALLET_PUBKEY) : undefined,
    commitment: (env.HELIUS_COMMITMENT ?? "confirmed") as
      | "processed"
      | "confirmed"
      | "finalized",
    heliusSubscribeLogs: parseBool(env.HELIUS_SUBSCRIBE_LOGS, true),
    heliusSubscribeWallet: parseBool(env.HELIUS_SUBSCRIBE_WALLET, true),
    heliusSubscribeTokens: parseBool(env.HELIUS_SUBSCRIBE_TOKENS, true),
    heliusTokenMintAllowlist: heliusTokenMintAllowlist.length
      ? heliusTokenMintAllowlist
      : undefined,
    heartbeatIntervalMs: Number(env.HEARTBEAT_INTERVAL_MS ?? 5000),
    staleSeconds: Number(env.STALE_SECONDS ?? 30),
    pricePollIntervalMs: Number(env.PRICE_POLL_INTERVAL_MS ?? 15000),
    priceSymbols: (env.PRICE_POLL_SYMBOLS ?? "SOL")
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean),
    jupiterPriceUrl: env.JUPITER_PRICE_URL ?? "https://price.jup.ag/v6/price",
    priceSource: (env.PRICE_SOURCE ?? "coingecko") as "jupiter" | "coingecko" | "kraken",
    coingeckoPriceUrl:
      env.COINGECKO_PRICE_URL ?? "https://api.coingecko.com/api/v3/simple/price",
    perpsEnabled,
    perpsMarkets,
    perpsPollIntervalMs: Number(env.PERPS_POLL_INTERVAL_MS ?? 30000)
  };
}
