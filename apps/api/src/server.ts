import Fastify from "fastify";
import type { BotCommandAction, BotConfig, PerpsRiskConfig, RiskLimits } from "@zero/core";
import { CACHE_KEYS } from "@zero/core";
import type { PrismaClient } from "@zero/db";
import { RedisBus } from "./redisBus";

export function buildServer(bus: RedisBus, db: PrismaClient) {
  const server = Fastify({ logger: true });
  const defaultWalletId = process.env.BOT_WALLET_PUBKEY;
  const defaultPerpsRiskConfig: PerpsRiskConfig = {
    liquidationBufferPct: 5,
    liquidationBufferHealthRatio: 1.2,
    leverageCap: 3,
    maxDailyLoss: "150",
    maxNotional: "2000",
    fundingGuardrailBps: 50,
    markOracleDivergenceBps: 50,
    reduceOnlyTriggerBps: 200
  };

  server.get("/health", async () => ({
    ok: true,
    service: "api",
    ts: new Date().toISOString()
  }));

  server.get("/bots/:id/state", async (request, reply) => {
    const botId = (request.params as { id: string }).id;
    const state = await bus.getCache(CACHE_KEYS.bot(botId));
    if (!state) {
      reply.code(404);
      return { ok: false, error: "bot not found" };
    }
    return { ok: true, state };
  });

  server.get("/bots", async () => {
    const bots = await db.bot.findMany({ orderBy: { createdAt: "desc" } });
    const runtimes = await Promise.all(
      bots.map(async (bot) => ({ id: bot.id, runtime: await bus.getCache(CACHE_KEYS.bot(bot.id)) }))
    );
    const runtimeById = new Map(runtimes.map((entry) => [entry.id, entry.runtime]));
    return {
      ok: true,
      bots: bots.map((bot) => ({
        ...bot,
        runtime: runtimeById.get(bot.id) ?? undefined
      }))
    };
  });

  server.get("/bots/:id", async (request, reply) => {
    const botId = (request.params as { id: string }).id;
    const bot = await db.bot.findUnique({ where: { id: botId } });
    if (!bot) {
      reply.code(404);
      return { ok: false, error: "bot not found" };
    }
    const runtime = await bus.getCache(CACHE_KEYS.bot(botId));
    return { ok: true, bot: { ...bot, runtime } };
  });

  server.get("/bots/:id/orders", async (request, reply) => {
    const botId = (request.params as { id: string }).id;
    const query = request.query as { limit?: string };
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const orders = await db.order.findMany({
      where: { botId },
      orderBy: { placedAt: "desc" },
      take: limit
    });
    if (!orders) {
      reply.code(404);
      return { ok: false, error: "bot not found" };
    }
    return { ok: true, orders };
  });

  server.get("/bots/:id/snapshots", async (request) => {
    const botId = (request.params as { id: string }).id;
    const query = request.query as { limit?: string };
    const limit = Math.min(Number(query.limit ?? 200), 1000);
    const snapshots = await db.botSnapshot.findMany({
      where: { botId },
      orderBy: { ts: "asc" },
      take: limit
    });
    return {
      ok: true,
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        ts: snapshot.ts.toISOString(),
        equity: snapshot.equity?.toString() ?? null,
        pnlRealized: snapshot.pnlRealized?.toString() ?? null,
        pnlUnrealized: snapshot.pnlUnrealized?.toString() ?? null,
        state: snapshot.state
      }))
    };
  });

  server.get("/bots/:id/fills", async (request, reply) => {
    const botId = (request.params as { id: string }).id;
    const query = request.query as { limit?: string };
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const fills = await db.fill.findMany({
      where: { order: { botId } },
      orderBy: { filledAt: "desc" },
      take: limit,
      include: {
        order: {
          select: {
            side: true,
            market: true,
            venue: true
          }
        }
      }
    });
    return { ok: true, fills };
  });

  server.get("/bots/:id/events", async (request) => {
    const botId = (request.params as { id: string }).id;
    const query = request.query as { limit?: string; kind?: string };
    const limit = Math.min(Number(query.limit ?? 100), 500);
    const events = await db.eventLog.findMany({
      where: {
        botId,
        kind: query.kind ?? undefined
      },
      orderBy: { ts: "desc" },
      take: limit
    });
    return { ok: true, events };
  });

  server.get("/account/snapshots", async (request, reply) => {
    const query = request.query as { walletId?: string; limit?: string; since?: string; until?: string };
    let walletId = query.walletId ?? defaultWalletId ?? null;
    if (!walletId) {
      const latest = await db.accountSnapshot.findFirst({ orderBy: { ts: "desc" } });
      walletId = latest?.walletId ?? null;
    }
    if (!walletId) {
      reply.code(404);
      return { ok: false, error: "no account snapshots" };
    }
    const limit = Math.min(Number(query.limit ?? 2000), 50000);
    const since = query.since ? new Date(query.since) : null;
    const until = query.until ? new Date(query.until) : null;
    const where: { walletId: string; ts?: { gte?: Date; lte?: Date } } = { walletId };
    if (since || until) {
      where.ts = {};
      if (since && !Number.isNaN(since.getTime())) {
        where.ts.gte = since;
      }
      if (until && !Number.isNaN(until.getTime())) {
        where.ts.lte = until;
      }
    }
    const snapshots = await db.accountSnapshot.findMany({
      where,
      orderBy: { ts: "asc" },
      take: limit
    });
    return {
      ok: true,
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        walletId: snapshot.walletId,
        ts: snapshot.ts.toISOString(),
        equity: snapshot.equity?.toString() ?? null,
        pnlRealized: snapshot.pnlRealized?.toString() ?? null,
        pnlUnrealized: snapshot.pnlUnrealized?.toString() ?? null,
        balances: snapshot.balances
      }))
    };
  });

  server.get("/account/balances", async (request, reply) => {
    const query = request.query as { walletId?: string };
    let walletId = query.walletId ?? defaultWalletId ?? null;
    if (!walletId) {
      const latest = await db.accountSnapshot.findFirst({ orderBy: { ts: "desc" } });
      walletId = latest?.walletId ?? null;
    }
    if (!walletId) {
      reply.code(404);
      return { ok: false, error: "no account snapshots" };
    }
    const snapshot = await db.accountSnapshot.findFirst({
      where: { walletId },
      orderBy: { ts: "desc" }
    });
    if (!snapshot) {
      reply.code(404);
      return { ok: false, error: "no account snapshots" };
    }
    return {
      ok: true,
      snapshot: {
        id: snapshot.id,
        walletId: snapshot.walletId,
        ts: snapshot.ts.toISOString(),
        equity: snapshot.equity?.toString() ?? null,
        pnlRealized: snapshot.pnlRealized?.toString() ?? null,
        pnlUnrealized: snapshot.pnlUnrealized?.toString() ?? null,
        balances: snapshot.balances
      }
    };
  });

  server.get("/account/fills", async (request, reply) => {
    const query = request.query as { walletId?: string; limit?: string; since?: string; until?: string };
    const limit = Math.min(Number(query.limit ?? 2000), 20000);
    const since = query.since ? new Date(query.since) : null;
    const until = query.until ? new Date(query.until) : null;
    const where: { filledAt?: { gte?: Date; lte?: Date } } = {};
    if (since || until) {
      where.filledAt = {};
      if (since && !Number.isNaN(since.getTime())) {
        where.filledAt.gte = since;
      }
      if (until && !Number.isNaN(until.getTime())) {
        where.filledAt.lte = until;
      }
    }
    const fills = await db.fill.findMany({
      where,
      orderBy: { filledAt: "desc" },
      take: limit,
      include: {
        order: {
          select: {
            side: true,
            market: true,
            venue: true
          }
        }
      }
    });
    return { ok: true, fills };
  });

  server.get("/perps/risk-config", async () => {
    const stored = await db.perpsRiskConfig.findUnique({ where: { id: "global" } });
    return { ok: true, config: stored?.config ?? defaultPerpsRiskConfig };
  });

  server.put("/perps/risk-config", async (request, reply) => {
    const body = request.body as { config?: PerpsRiskConfig };
    if (!body?.config) {
      reply.code(400);
      return { ok: false, error: "config is required" };
    }
    const updated = await db.perpsRiskConfig.upsert({
      where: { id: "global" },
      update: { config: body.config },
      create: { id: "global", config: body.config }
    });
    return { ok: true, config: updated.config };
  });

  server.get("/perps/bots/:id/position", async (request, reply) => {
    const botId = (request.params as { id: string }).id;
    const position = await db.perpsPosition.findFirst({
      where: { botId },
      orderBy: { ts: "desc" }
    });
    if (!position) {
      reply.code(404);
      return { ok: false, error: "no perps position" };
    }
    return {
      ok: true,
      position: {
        id: position.id,
        market: position.market,
        baseQty: position.baseQty.toString(),
        quoteQty: position.quoteQty.toString(),
        entryPrice: position.entryPrice?.toString() ?? null,
        markPrice: position.markPrice?.toString() ?? null,
        leverage: position.leverage?.toString() ?? null,
        liqPrice: position.liqPrice?.toString() ?? null,
        pnlUnrealized: position.pnlUnrealized?.toString() ?? null,
        pnlRealized: position.pnlRealized?.toString() ?? null,
        pnlFunding: position.pnlFunding?.toString() ?? null,
        ts: position.ts.toISOString()
      }
    };
  });

  server.get("/perps/bots/:id/margin", async (request, reply) => {
    const botId = (request.params as { id: string }).id;
    const snapshot = await db.perpsMarginSnapshot.findFirst({
      where: { botId },
      orderBy: { ts: "desc" }
    });
    if (!snapshot) {
      reply.code(404);
      return { ok: false, error: "no perps margin snapshot" };
    }
    return {
      ok: true,
      margin: {
        id: snapshot.id,
        equity: snapshot.equity?.toString() ?? null,
        marginUsed: snapshot.marginUsed?.toString() ?? null,
        healthRatio: snapshot.healthRatio?.toString() ?? null,
        leverage: snapshot.leverage?.toString() ?? null,
        ts: snapshot.ts.toISOString()
      }
    };
  });

  server.post("/bots", async (request, reply) => {
    const body = request.body as {
      name?: string;
      strategyKey?: string;
      venue?: string;
      market?: string;
      config?: BotConfig;
      riskConfig?: RiskLimits;
      schedule?: Record<string, unknown>;
      status?: string;
    };
    if (!body?.name || !body?.strategyKey || !body?.venue || !body?.market || !body?.config) {
      reply.code(400);
      return { ok: false, error: "missing required fields" };
    }
    const bot = await db.bot.create({
      data: {
        name: body.name,
        strategyKey: body.strategyKey,
        venue: body.venue,
        market: body.market,
        config: body.config,
        riskConfig: body.riskConfig ?? {},
        schedule: body.schedule ?? null,
        status: body.status ?? "stopped"
      }
    });
    await bus.publishCommand(bot.id, "update_config", { config: body.config });
    return { ok: true, bot };
  });

  server.patch("/bots/:id", async (request, reply) => {
    const botId = (request.params as { id: string }).id;
    const body = request.body as {
      name?: string;
      strategyKey?: string;
      venue?: string;
      market?: string;
      config?: BotConfig;
      riskConfig?: RiskLimits;
      schedule?: Record<string, unknown> | null;
      status?: string;
      cancelOpenOrders?: boolean;
    };
    const existing = await db.bot.findUnique({ where: { id: botId } });
    if (!existing) {
      reply.code(404);
      return { ok: false, error: "bot not found" };
    }
    const bot = await db.bot.update({
      where: { id: botId },
      data: {
        name: body.name,
        strategyKey: body.strategyKey,
        venue: body.venue,
        market: body.market,
        config: body.config,
        riskConfig: body.riskConfig,
        schedule: body.schedule,
        status: body.status
      }
    });
    if (body.config) {
      await bus.publishCommand(bot.id, "update_config", {
        config: body.config,
        cancelOpenOrders: body.cancelOpenOrders === true
      });
    }
    return { ok: true, bot };
  });

  server.post("/bots/:id/command", async (request, reply) => {
    const botId = (request.params as { id: string }).id;
    const body = request.body as { action?: BotCommandAction; payload?: Record<string, unknown> };
    if (!body?.action) {
      reply.code(400);
      return { ok: false, error: "action is required" };
    }
    const command = await bus.publishCommand(botId, body.action, body.payload);
    return { ok: true, command };
  });

  server.get("/events", async (request, reply) => {
    const query = request.query as { botId?: string };
    const botId = query?.botId;
    const patterns = [botId ? `evt:bot:${botId}` : "evt:bot:*", "health:*"];

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    reply.raw.write(": connected\n\n");

    const subscriber = bus.createSubscriber();
    const keepalive = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15000);

    subscriber.psubscribe(...patterns, (err) => {
      if (err) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      }
    });

    subscriber.on("pmessage", (_pattern, channel, message) => {
      let parsed: unknown = message;
      try {
        parsed = JSON.parse(message);
      } catch {
        parsed = message;
      }
      const payload = JSON.stringify({ channel, message: parsed });
      reply.raw.write(`data: ${payload}\n\n`);
    });

    request.raw.on("close", () => {
      clearInterval(keepalive);
      void subscriber.quit();
    });
  });

  return server;
}
