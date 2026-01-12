import Fastify from "fastify";
import { CACHE_KEYS } from "@zero/core";
import type { BotCommandAction } from "@zero/core";
import { RedisBus } from "./redisBus";

export function buildServer(bus: RedisBus) {
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

  return server;
}
