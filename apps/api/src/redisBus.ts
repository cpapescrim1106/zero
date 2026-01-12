import { randomUUID } from "crypto";
import Redis from "ioredis";
import type { BotCommand } from "@zero/core";
import { CHANNELS } from "@zero/core";

export class RedisBus {
  private pub: Redis;
  private read: Redis;

  constructor(redisUrl: string) {
    this.pub = new Redis(redisUrl);
    this.read = new Redis(redisUrl);
  }

  async close() {
    await Promise.all([this.pub.quit(), this.read.quit()]);
  }

  async publishCommand(botId: string, action: BotCommand["action"], payload?: BotCommand["payload"]) {
    const command: BotCommand = {
      version: "v1",
      id: randomUUID(),
      botId,
      action,
      ts: new Date().toISOString(),
      payload
    };
    await this.pub.publish(CHANNELS.botCmd(botId), JSON.stringify(command));
    return command;
  }

  async getCache(key: string) {
    const raw = await this.read.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as unknown;
  }
}
