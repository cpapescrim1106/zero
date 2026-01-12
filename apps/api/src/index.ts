import { loadConfig } from "./config";
import { createDb } from "./db";
import { RedisBus } from "./redisBus";
import { buildServer } from "./server";

const config = loadConfig();
const bus = new RedisBus(config.redisUrl);
const db = createDb(config.databaseUrl);
const server = buildServer(bus, db);

server
  .listen({ port: config.port, host: config.host })
  .then(() => {
    server.log.info({ port: config.port, host: config.host }, "api listening");
  })
  .catch((err) => {
    server.log.error(err, "api failed to start");
    process.exit(1);
  });

process.on("SIGINT", () =>
  void Promise.all([bus.close(), db.$disconnect()]).finally(() => process.exit(0))
);
process.on("SIGTERM", () =>
  void Promise.all([bus.close(), db.$disconnect()]).finally(() => process.exit(0))
);
