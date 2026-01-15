export interface BotRunnerConfig {
  port: number;
  host: string;
  redisUrl: string;
  databaseUrl: string;
  solanaPrivateKey: string;
  solanaRpcUrl: string;
  solanaCluster: "mainnet-beta" | "devnet" | "localnet";
  driftEnv: "mainnet-beta" | "devnet";
  walletPubkey?: string;
  jupiterTriggerApiUrl: string;
  jupiterApiKey?: string;
  jupiterComputeUnitPrice: "auto" | string;
  jupiterApiRps: number;
  jupiterMinOrderUsd: number;
  heartbeatIntervalMs: number;
  reconcileIntervalMs: number;
  fillReconcileIntervalMs: number;
  snapshotIntervalMs: number;
  accountSnapshotIntervalMs: number;
  staleSeconds: number;
  persistenceEnabled: boolean;
  executionEnabled: boolean;
  executionMode: "live" | "simulated" | "disabled";
}

function required(name: string, value?: string): string {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function loadConfig(env = process.env): BotRunnerConfig {
  const explicitMode = env.EXECUTION_MODE as BotRunnerConfig["executionMode"] | undefined;
  const executionEnabled = env.EXECUTION_ENABLED !== "false";
  const executionMode =
    explicitMode ?? (executionEnabled ? "live" : "disabled");
  const apiRps = Number(env.JUPITER_API_RPS);
  const jupiterApiRps = Number.isFinite(apiRps) && apiRps > 0 ? apiRps : 1;
  const minOrderUsd = Number(env.JUPITER_MIN_ORDER_USD);
  const jupiterMinOrderUsd = Number.isFinite(minOrderUsd) && minOrderUsd > 0 ? minOrderUsd : 5;
  return {
    port: Number(env.PORT ?? 3003),
    host: env.HOST ?? "0.0.0.0",
    redisUrl: required("REDIS_URL", env.REDIS_URL),
    databaseUrl: required("DATABASE_URL", env.DATABASE_URL),
    solanaPrivateKey: executionEnabled
      ? required("SOLANA_PRIVATE_KEY", env.SOLANA_PRIVATE_KEY)
      : env.SOLANA_PRIVATE_KEY ?? "",
    solanaRpcUrl: env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    solanaCluster: (env.SOLANA_CLUSTER ?? "mainnet-beta") as
      | "mainnet-beta"
      | "devnet"
      | "localnet",
    driftEnv: (env.DRIFT_ENV ?? env.SOLANA_CLUSTER ?? "mainnet-beta") as "mainnet-beta" | "devnet",
    walletPubkey: env.BOT_WALLET_PUBKEY,
    jupiterTriggerApiUrl:
      env.JUPITER_TRIGGER_API_URL ??
      env.JUPITER_API_URL ??
      "https://api.jup.ag/trigger/v1",
    jupiterApiKey: env.JUPITER_API_KEY,
    jupiterComputeUnitPrice: env.JUPITER_COMPUTE_UNIT_PRICE ?? "auto",
    jupiterApiRps,
    jupiterMinOrderUsd,
    heartbeatIntervalMs: Number(env.HEARTBEAT_INTERVAL_MS ?? 5000),
    reconcileIntervalMs: Number(env.RECONCILE_INTERVAL_MS ?? 120000),
    fillReconcileIntervalMs: Number(env.FILL_RECONCILE_INTERVAL_MS ?? 30000),
    snapshotIntervalMs: Number(env.SNAPSHOT_INTERVAL_MS ?? 30000),
    accountSnapshotIntervalMs: Number(env.ACCOUNT_SNAPSHOT_INTERVAL_MS ?? 60000),
    staleSeconds: Number(env.STALE_SECONDS ?? 30),
    persistenceEnabled: env.PERSISTENCE_ENABLED !== "false",
    executionEnabled: executionMode !== "disabled",
    executionMode
  };
}
