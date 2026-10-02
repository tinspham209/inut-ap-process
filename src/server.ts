import { serve } from "@hono/node-server";
import app from "./index.js";
import { config } from "./configured-app.js";
import { serverLogger } from "./logger.js";

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (address) => {
    serverLogger.info("server.listening", { port: address.port });
  },
);

server.on("error", () => {
  serverLogger.error("server.listen_failed", {
    port: config.port,
    code: "SERVER_LISTEN_FAILED",
  });
});
