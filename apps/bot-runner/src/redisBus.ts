import { randomUUID } from "crypto";
import Redis from "ioredis";
import type { NormalizedEvent } from "@zero/core";
import { CACHE_KEYS, CHANNELS, type RedisEnvelope, type ServiceName } from "@zero/core";

export type PatternHandler = (channel: string, message: string) => void;

export class RedisBus {
  private pub: Redis;
  private sub: Redis;

  constructor(redisUrl: string) {
    this.pub = new Redis(redisUrl);
    this.sub = new Redis(redisUrl);
  }

  async close() {
    await Promise.all([this.pub.quit(), this.sub.quit()]);
  }

  async publishEvent(channel: string, event: NormalizedEvent) {
    const envelope: RedisEnvelope<NormalizedEvent> = {
      version: event.version,
      ts: event.ts,
      kind: event.kind,
      data: event
    };
    await this.pub.publish(channel, JSON.stringify(envelope));
  }

  async publishBotEvent(event: NormalizedEvent) {
    if (!event.botId) {
      return;
    }
    await this.publishEvent(CHANNELS.botEvt(event.botId), event);
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
    await this.pub.set(CACHE_KEYS.health(service), JSON.stringify(event));
  }

  async setCache(key: string, value: unknown) {
    await this.pub.set(key, JSON.stringify(value));
  }

  onPattern(pattern: string, handler: PatternHandler) {
    this.sub.psubscribe(pattern, (err) => {
      if (err) {
        console.error("[redis] psubscribe failed", err);
      }
    });
    this.sub.on("pmessage", (_pattern, channel, message) => {
      if (_pattern !== pattern) {
        return;
      }
      handler(channel, message);
    });
  }
}
