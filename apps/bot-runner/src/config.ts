export interface BotRunnerConfig {
  port: number;
  host: string;
  redisUrl: string;
  databaseUrl: string;
  solanaPrivateKey: string;
  solanaRpcUrl: string;
  solanaCluster: "mainnet-beta" | "devnet" | "localnet";
  jupiterTriggerApiUrl: string;
  jupiterApiKey?: string;
  jupiterComputeUnitPrice: "auto" | string;
  heartbeatIntervalMs: number;
  reconcileIntervalMs: number;
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
    jupiterTriggerApiUrl:
      env.JUPITER_TRIGGER_API_URL ??
      env.JUPITER_API_URL ??
      "https://api.jup.ag/trigger/v1",
    jupiterApiKey: env.JUPITER_API_KEY,
    jupiterComputeUnitPrice: env.JUPITER_COMPUTE_UNIT_PRICE ?? "auto",
    heartbeatIntervalMs: Number(env.HEARTBEAT_INTERVAL_MS ?? 5000),
    reconcileIntervalMs: Number(env.RECONCILE_INTERVAL_MS ?? 60000),
    staleSeconds: Number(env.STALE_SECONDS ?? 30),
    persistenceEnabled: env.PERSISTENCE_ENABLED !== "false",
    executionEnabled: executionMode !== "disabled",
    executionMode
  };
}
