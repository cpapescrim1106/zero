import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { buildServer } from "./server";
import { loadConfig } from "./config";
import { BotRunnerService } from "./runnerService";

const defaultEnvPath = path.resolve(process.cwd(), ".env.local");
const fallbackEnvPath = path.resolve(process.cwd(), "apps/bot-runner/.env.local");
const envPath =
  process.env.ENV_PATH ?? (fs.existsSync(defaultEnvPath) ? defaultEnvPath : fallbackEnvPath);
dotenv.config({ path: envPath });

const config = loadConfig();
const server = buildServer();
const service = new BotRunnerService(config);

server
  .listen({ port: config.port, host: config.host })
  .then(async () => {
    server.log.info({ port: config.port, host: config.host }, "bot-runner listening");
    await service.start();
  })
  .catch((err) => {
    server.log.error(err, "bot-runner failed to start");
    process.exit(1);
  });

process.on("SIGINT", () => void service.stop().finally(() => process.exit(0)));
process.on("SIGTERM", () => void service.stop().finally(() => process.exit(0)));
