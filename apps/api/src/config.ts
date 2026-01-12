export interface ApiConfig {
  port: number;
  host: string;
  redisUrl: string;
  databaseUrl: string;
}

function required(name: string, value?: string): string {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function loadConfig(env = process.env): ApiConfig {
  return {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? "0.0.0.0",
    redisUrl: required("REDIS_URL", env.REDIS_URL),
    databaseUrl: required("DATABASE_URL", env.DATABASE_URL)
  };
}
