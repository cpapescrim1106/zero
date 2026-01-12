import Fastify from "fastify";

export function buildServer() {
  const server = Fastify({ logger: true });

  server.get("/health", async () => ({
    ok: true,
    service: "api",
    ts: new Date().toISOString()
  }));

  return server;
}
