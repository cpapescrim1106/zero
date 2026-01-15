import { randomUUID } from "crypto";
import { Prisma, PrismaClient } from "@zero/db";
import type { BotConfig, BotState, FillEvent, NormalizedEvent, OrderEvent } from "@zero/core";

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

  async logEvent(event: NormalizedEvent, context?: { market?: string; runId?: string }) {
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

    if (event.kind === "order" && context?.market) {
      await this.recordOrderEvent(event, context.market, context.runId);
    }
    if (event.kind === "fill") {
      await this.recordFillEvent(event);
    }
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

  async saveAccountSnapshot(snapshot: {
    walletId: string;
    ts?: string;
    equity?: string | null;
    balances: Array<{
      mint: string;
      symbol?: string | null;
      amount: string;
      priceUsd?: string | null;
      usdValue?: string | null;
    }>;
    pnlRealized?: string | null;
    pnlUnrealized?: string | null;
  }) {
    if (!this.prisma) {
      return;
    }
    const equity =
      snapshot.equity && Number.isFinite(Number(snapshot.equity))
        ? new Prisma.Decimal(snapshot.equity)
        : null;
    const pnlRealized =
      snapshot.pnlRealized && Number.isFinite(Number(snapshot.pnlRealized))
        ? new Prisma.Decimal(snapshot.pnlRealized)
        : null;
    const pnlUnrealized =
      snapshot.pnlUnrealized && Number.isFinite(Number(snapshot.pnlUnrealized))
        ? new Prisma.Decimal(snapshot.pnlUnrealized)
        : null;
    await this.prisma.accountSnapshot.create({
      data: {
        walletId: snapshot.walletId,
        ts: snapshot.ts ? new Date(snapshot.ts) : new Date(),
        equity,
        pnlRealized,
        pnlUnrealized,
        balances: snapshot.balances as unknown as object
      }
    });
  }

  private async recordOrderEvent(event: OrderEvent, market: string, runId?: string) {
    if (!this.prisma || !event.botId) {
      return;
    }
    const price = event.price ? new Prisma.Decimal(event.price) : new Prisma.Decimal(0);
    const size = event.size ? new Prisma.Decimal(event.size) : new Prisma.Decimal(0);
    await this.prisma.order.upsert({
      where: { id: event.orderId },
      create: {
        id: event.orderId,
        botId: event.botId,
        runId: runId ?? null,
        venue: event.venue,
        market,
        externalId: event.externalId ?? null,
        clientOrderId: event.orderId,
        side: event.side,
        price,
        size,
        status: event.status,
        placedAt: new Date(event.ts),
        meta: {
          eventId: event.id,
          error: event.error ?? null
        }
      },
      update: {
        externalId: event.externalId ?? undefined,
        status: event.status,
        price: event.price ? price : undefined,
        size: event.size ? size : undefined,
        updatedAt: new Date(event.ts),
        meta: event.error ? { error: event.error } : undefined
      }
    });
  }

  private async recordFillEvent(event: FillEvent) {
    if (!this.prisma) {
      return;
    }
    await this.prisma.fill.create({
      data: {
        id: event.id,
        orderId: event.orderId,
        venue: event.venue,
        txSig: event.txSig ?? event.id,
        qty: new Prisma.Decimal(event.qty),
        price: new Prisma.Decimal(event.price),
        fees: event.fee ? new Prisma.Decimal(event.fee) : null,
        realizedPnl: event.realizedPnl ? new Prisma.Decimal(event.realizedPnl) : null,
        filledAt: new Date(event.ts),
        meta: event as unknown as object
      }
    });
  }

  async listBots() {
    if (!this.prisma) {
      return [];
    }
    return this.prisma.bot.findMany();
  }

  async getPerpsAccount(botId: string) {
    if (!this.prisma) {
      return null;
    }
    return this.prisma.perpsAccount.findUnique({ where: { botId } });
  }

  async ensurePerpsAccount(botId: string, walletId: string, venue: string) {
    if (!this.prisma) {
      return null;
    }
    const existing = await this.prisma.perpsAccount.findUnique({ where: { botId } });
    if (existing) {
      return existing;
    }
    const latest = await this.prisma.perpsAccount.findFirst({ orderBy: { subaccountId: "desc" } });
    const nextSubaccount = latest ? latest.subaccountId + 1 : 0;
    return this.prisma.perpsAccount.create({
      data: {
        botId,
        walletId,
        subaccountId: nextSubaccount,
        venue
      }
    });
  }

  async getPerpsRiskConfig() {
    if (!this.prisma) {
      return null;
    }
    return this.prisma.perpsRiskConfig.findUnique({ where: { id: "global" } });
  }

  async updateBotStatus(botId: string, status: string) {
    if (!this.prisma) {
      return;
    }
    await this.prisma.bot.update({
      where: { id: botId },
      data: { status }
    });
  }

  async listOpenOrders(botId: string) {
    if (!this.prisma) {
      return [];
    }
    return this.prisma.order.findMany({
      where: {
        botId,
        status: {
          in: ["new", "open", "partial"]
        }
      },
      orderBy: { placedAt: "desc" }
    });
  }

  async findOrderByExternalId(externalId: string) {
    if (!this.prisma) {
      return null;
    }
    return this.prisma.order.findFirst({
      where: { externalId }
    });
  }

  async listOpenOrdersForMarket(market: string) {
    if (!this.prisma) {
      return [];
    }
    return this.prisma.order.findMany({
      where: {
        market,
        status: {
          in: ["new", "open", "partial"]
        }
      },
      orderBy: { placedAt: "desc" }
    });
  }

  async listOpenOrdersByQuote(quoteSymbol: string) {
    if (!this.prisma) {
      return [];
    }
    return this.prisma.order.findMany({
      where: {
        status: {
          in: ["new", "open", "partial"]
        },
        market: {
          endsWith: `/${quoteSymbol}`
        }
      },
      orderBy: { placedAt: "desc" }
    });
  }

  async fillExists(txSig: string) {
    if (!this.prisma) {
      return false;
    }
    const existing = await this.prisma.fill.findFirst({ where: { txSig } });
    return Boolean(existing);
  }

  async findFillByTxSig(txSig: string) {
    if (!this.prisma) {
      return null;
    }
    return this.prisma.fill.findFirst({ where: { txSig } });
  }

  async updateFillTimestamp(id: string, filledAt: string) {
    if (!this.prisma) {
      return;
    }
    await this.prisma.fill.update({
      where: { id },
      data: { filledAt: new Date(filledAt) }
    });
  }

  async updateOrderStatus(orderId: string, status: string, ts?: string) {
    if (!this.prisma) {
      return;
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        updatedAt: ts ? new Date(ts) : new Date()
      }
    });
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
