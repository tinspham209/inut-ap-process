const requiredEnvironmentVariables = [
  "TRELLO_API_KEY",
  "TRELLO_API_TOKEN",
  "TRELLO_BOARD_ID",
  "TRELLO_PAID_LIST_ID",
  "TRELLO_RESULT_CARD_ID",
  "AMAZING_FIELDS_PLUGIN_ID",
  "RECONCILE_CRON_SECRET",
  "RECONCILE_BUTTON_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
] as const;

type RequiredEnvironmentVariable =
  (typeof requiredEnvironmentVariables)[number];

export interface AppConfig {
  trelloApiKey: string;
  trelloApiToken: string;
  trelloBoardId: string;
  trelloPaidListId: string;
  trelloResultCardId: string;
  amazingFieldsPluginId: string;
  reconcileCronSecret: string;
  reconcileButtonSecret: string;
  telegramBotToken: string;
  telegramChatId: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const missing = requiredEnvironmentVariables.filter(
    (name) => !env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  const required = (name: RequiredEnvironmentVariable): string => {
    const value = env[name]?.trim();
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  };

  const reconcileCronSecret = required("RECONCILE_CRON_SECRET");
  const reconcileButtonSecret = required("RECONCILE_BUTTON_SECRET");
  if (reconcileCronSecret === reconcileButtonSecret) {
    throw new Error(
      "RECONCILE_CRON_SECRET and RECONCILE_BUTTON_SECRET must be different",
    );
  }

  const portValue = env.PORT?.trim();
  const port = portValue ? Number(portValue) : 3000;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return {
    trelloApiKey: required("TRELLO_API_KEY"),
    trelloApiToken: required("TRELLO_API_TOKEN"),
    trelloBoardId: required("TRELLO_BOARD_ID"),
    trelloPaidListId: required("TRELLO_PAID_LIST_ID"),
    trelloResultCardId: required("TRELLO_RESULT_CARD_ID"),
    amazingFieldsPluginId: required("AMAZING_FIELDS_PLUGIN_ID"),
    reconcileCronSecret,
    reconcileButtonSecret,
    telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
    telegramChatId: required("TELEGRAM_CHAT_ID"),
    port,
  };
}
