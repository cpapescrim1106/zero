import { buildServer } from "./server";

const port = Number(process.env.PORT ?? 3003);
const host = process.env.HOST ?? "0.0.0.0";

const server = buildServer();

server
  .listen({ port, host })
  .then(() => {
    server.log.info({ port, host }, "bot-runner listening");
  })
  .catch((err) => {
    server.log.error(err, "bot-runner failed to start");
    process.exit(1);
  });
