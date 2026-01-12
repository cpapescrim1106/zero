import { randomUUID } from "crypto";
import Redis from "ioredis";
import type { NormalizedEvent } from "@zero/core";
import { CACHE_KEYS, CHANNELS, type RedisEnvelope, type ServiceName } from "@zero/core";

export class RedisPublisher {
  private client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl);
  }

  async close() {
    await this.client.quit();
  }

  async publishEvent(channel: string, event: NormalizedEvent) {
    const envelope: RedisEnvelope<NormalizedEvent> = {
      version: event.version,
      ts: event.ts,
      kind: event.kind,
      data: event
    };
    await this.client.publish(channel, JSON.stringify(envelope));
  }

  async publishHealth(service: ServiceName, status: "ok" | "degraded" | "down", message?: string) {
    const event: NormalizedEvent = {
      id: randomUUID(),
      version: "v1",
      kind: "health",
      ts: new Date().toISOString(),
      source: "internal",
      service,
      status,
      message
    };
    await this.publishEvent(CHANNELS.health(service), event);
    await this.client.set(CACHE_KEYS.health(service), JSON.stringify(event));
  }

  async setCache(key: string, value: unknown) {
    await this.client.set(key, JSON.stringify(value));
  }
}
