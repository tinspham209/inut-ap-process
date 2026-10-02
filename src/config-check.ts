import {
  AmazingFieldsConfigError,
  parseAmazingFieldsConfig,
} from "./trello/amazing-fields.js";
import {
  TrelloApiError,
  type TrelloPluginData,
  type VerifiedTrelloTargets,
} from "./trello/client.js";

export interface ConfigCheckClient {
  verifyConfiguredTargets(): Promise<VerifiedTrelloTargets>;
  getBoardPluginData(boardId: string): Promise<TrelloPluginData[]>;
}

export interface ConfigCheckItem {
  name:
    | "environment"
    | "trello_access_and_targets"
    | "amazing_fields_board_config"
    | "telegram_configuration";
  status: "passed" | "failed" | "configured_not_tested";
  code?: string;
  upstreamStatus?: number;
}

export interface ConfigCheckResult {
  ready: boolean;
  checks: ConfigCheckItem[];
}

export async function checkRuntimeConfiguration(options: {
  client: ConfigCheckClient;
  pluginId: string;
  telegramConfigured: boolean;
}): Promise<ConfigCheckResult> {
  const checks: ConfigCheckItem[] = [
    { name: "environment", status: "passed" },
    {
      name: "telegram_configuration",
      status: options.telegramConfigured ? "configured_not_tested" : "failed",
      ...(!options.telegramConfigured
        ? { code: "TELEGRAM_CONFIGURATION_MISSING" }
        : {}),
    },
  ];
  let targets: VerifiedTrelloTargets;

  try {
    targets = await options.client.verifyConfiguredTargets();
    checks.push({
      name: "trello_access_and_targets",
      status: "passed",
    });
  } catch (error) {
    checks.push({
      name: "trello_access_and_targets",
      status: "failed",
      code:
        error instanceof TrelloApiError
          ? "TRELLO_ACCESS_OR_TARGET_INVALID"
          : "TRELLO_CHECK_FAILED",
      ...(error instanceof TrelloApiError
        ? { upstreamStatus: error.status }
        : {}),
    });
    return { ready: false, checks };
  }

  try {
    const pluginData = await options.client.getBoardPluginData(targets.boardId);
    parseAmazingFieldsConfig(pluginData, options.pluginId, targets.boardId);
    checks.push({
      name: "amazing_fields_board_config",
      status: "passed",
    });
  } catch (error) {
    checks.push({
      name: "amazing_fields_board_config",
      status: "failed",
      code:
        error instanceof AmazingFieldsConfigError
          ? "AMAZING_FIELDS_CONFIGURATION_INVALID"
          : error instanceof TrelloApiError
            ? "TRELLO_PLUGIN_DATA_UNAVAILABLE"
            : "CONFIGURATION_CHECK_FAILED",
      ...(error instanceof TrelloApiError
        ? { upstreamStatus: error.status }
        : {}),
    });
  }

  return {
    ready: checks.every(
      (check) =>
        check.status === "passed" ||
        check.status === "configured_not_tested",
    ),
    checks,
  };
}
