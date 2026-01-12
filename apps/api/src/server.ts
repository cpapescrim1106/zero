import Fastify from "fastify";
import type { BotCommandAction, BotConfig, RiskLimits } from "@zero/core";
import { CACHE_KEYS } from "@zero/core";
import type { PrismaClient } from "@zero/db";
import { RedisBus } from "./redisBus";

export function buildServer(bus: RedisBus, db: PrismaClient) {
  const server = Fastify({ logger: true });

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
    return { ok: true, bots };
  });

  server.get("/bots/:id", async (request, reply) => {
    const botId = (request.params as { id: string }).id;
    const bot = await db.bot.findUnique({ where: { id: botId } });
    if (!bot) {
      reply.code(404);
      return { ok: false, error: "bot not found" };
    }
    return { ok: true, bot };
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
      await bus.publishCommand(bot.id, "update_config", { config: body.config });
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
