import { randomUUID } from "crypto";
import { PrismaClient } from "@zero/db";
import type { BotConfig, BotState, NormalizedEvent } from "@zero/core";

export class Persistence {
  private prisma?: PrismaClient;
  private enabled: boolean;

  constructor(databaseUrl: string, enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      this.prisma = new PrismaClient({
        datasources: { db: { url: databaseUrl } }
      });
    }
  }

  async close() {
    if (this.prisma) {
      await this.prisma.$disconnect();
    }
  }

  async logEvent(event: NormalizedEvent) {
    if (!this.prisma) {
      return;
    }
    await this.prisma.eventLog.create({
      data: {
        version: event.version,
        kind: event.kind,
        ts: new Date(event.ts),
        botId: event.botId ?? null,
        source: event.source,
        payload: event as unknown as object
      }
    });
  }

  async saveBotSnapshot(state: BotState) {
    if (!this.prisma) {
      return;
    }
    await this.prisma.botSnapshot.create({
      data: {
        botId: state.botId,
        runId: state.runId ?? null,
        ts: state.lastEventAt ? new Date(state.lastEventAt) : new Date(),
        state: state as unknown as object,
        equity: state.equity ?? null,
        pnlRealized: state.pnlRealized ?? null,
        pnlUnrealized: state.pnlUnrealized ?? null
      }
    });
  }

  async listBots() {
    if (!this.prisma) {
      return [];
    }
    return this.prisma.bot.findMany();
  }

  async startBotRun(botId: string, config: BotConfig, strategyVersion: string) {
    if (!this.prisma) {
      return randomUUID();
    }
    const run = await this.prisma.botRun.create({
      data: {
        botId,
        configSnapshot: config as unknown as object,
        strategyVersion,
        status: "running"
      }
    });
    return run.id;
  }

  async endBotRun(runId: string, status: string) {
    if (!this.prisma) {
      return;
    }
    await this.prisma.botRun.update({
      where: { id: runId },
      data: {
        endedAt: new Date(),
        status
      }
    });
  }
}
