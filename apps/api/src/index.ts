import { buildServer } from "./server";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

const server = buildServer();

server
  .listen({ port, host })
  .then(() => {
    server.log.info({ port, host }, "api listening");
  })
  .catch((err) => {
    server.log.error(err, "api failed to start");
    process.exit(1);
  });
