import { createApp } from "./app.js";
import { checkRuntimeConfiguration } from "./config-check.js";
import { loadConfig } from "./config.js";
import { serverLogger } from "./logger.js";
import { executeReconciliation } from "./reconcile.js";
import { createTrelloClient } from "./trello/client.js";

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig(process.env);
} catch (error) {
  serverLogger.error("server.configuration_invalid", {
    code: "INVALID_ENVIRONMENT",
  });
  throw error;
}

const trelloClient = createTrelloClient({
  apiKey: config.trelloApiKey,
  apiToken: config.trelloApiToken,
  boardId: config.trelloBoardId,
  paidListId: config.trelloPaidListId,
  resultCardId: config.trelloResultCardId,
});

export const app = createApp({
  config,
  executeReconciliation: (requestId) =>
    executeReconciliation({
      client: trelloClient,
      pluginId: config.amazingFieldsPluginId,
      requestId,
      telegram: {
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
      },
    }),
  checkConfiguration: () =>
    checkRuntimeConfiguration({
      client: trelloClient,
      pluginId: config.amazingFieldsPluginId,
      telegramConfigured: Boolean(
        config.telegramBotToken.trim() && config.telegramChatId.trim(),
      ),
    }),
});

export { config };
