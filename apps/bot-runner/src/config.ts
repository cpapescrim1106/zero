export interface BotRunnerConfig {
  port: number;
  host: string;
  redisUrl: string;
  databaseUrl: string;
  solanaPrivateKey: string;
  jupiterApiUrl: string;
  heartbeatIntervalMs: number;
  reconcileIntervalMs: number;
  staleSeconds: number;
  persistenceEnabled: boolean;
  executionEnabled: boolean;
}

function required(name: string, value?: string): string {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function loadConfig(env = process.env): BotRunnerConfig {
  return {
    port: Number(env.PORT ?? 3003),
    host: env.HOST ?? "0.0.0.0",
    redisUrl: required("REDIS_URL", env.REDIS_URL),
    databaseUrl: required("DATABASE_URL", env.DATABASE_URL),
    solanaPrivateKey: required("SOLANA_PRIVATE_KEY", env.SOLANA_PRIVATE_KEY),
    jupiterApiUrl: env.JUPITER_API_URL ?? "https://limit-orders.jup.ag",
    heartbeatIntervalMs: Number(env.HEARTBEAT_INTERVAL_MS ?? 5000),
    reconcileIntervalMs: Number(env.RECONCILE_INTERVAL_MS ?? 60000),
    staleSeconds: Number(env.STALE_SECONDS ?? 30),
    persistenceEnabled: env.PERSISTENCE_ENABLED !== "false",
    executionEnabled: env.EXECUTION_ENABLED !== "false"
  };
}
