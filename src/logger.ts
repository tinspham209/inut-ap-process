export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | undefined>;

export interface ServerLogger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

const safeFields = new Set([
  "requestId",
  "method",
  "path",
  "status",
  "upstreamStatus",
  "durationMs",
  "caller",
  "code",
  "errorName",
  "issueCount",
  "notificationStatus",
  "port",
  "checkCount",
  "failedCheckCount",
  "stage",
  "paidCardCount",
]);

const safeEvents = new Set([
  "http.request.started",
  "http.request.completed",
  "http.request.unhandled_error",
  "reconciliation.started",
  "reconciliation.completed",
  "reconciliation.stage.started",
  "reconciliation.stage.completed",
  "configuration.check.completed",
  "configuration.check.failed",
  "server.configuration_invalid",
  "server.listening",
  "server.listen_failed",
]);

const safeCodes = new Set([
  "ARCHIVED_PAID_CARD",
  "AMAZING_FIELDS_CONFIGURATION_INVALID",
  "CONFIGURATION_CHECK_FAILED",
  "CONFIGURATION_CHECK_UNAVAILABLE",
  "CONFIGURATION_NOT_READY",
  "CONFIGURATION_READY",
  "INTERNAL_SERVER_ERROR",
  "INVALID_REQUEST",
  "INVALID_AMAZING_FIELDS_CONFIGURATION",
  "INVALID_ENVIRONMENT",
  "INVALID_HONO_LOG_LINE",
  "INVALID_PAID_CARD_DATA",
  "INVALID_RECONCILIATION_RESULT",
  "PAID_DATA_NOTIFICATION_FAILED",
  "PAID_DATA_NOTIFICATION_SENT",
  "RECONCILIATION_CONFLICT",
  "RECONCILIATION_IN_PROGRESS",
  "RECONCILIATION_FAILED",
  "RECONCILIATION_SUCCEEDED",
  "RESULT_DESCRIPTION_TOO_LONG",
  "SERVER_LISTEN_FAILED",
  "TELEGRAM_CONFIGURATION_MISSING",
  "TELEGRAM_NOTIFICATION_FAILED",
  "UNAUTHORIZED",
  "BUTTON_COOLDOWN",
  "TRELLO_ACCESS_OR_TARGET_INVALID",
  "TRELLO_CHECK_FAILED",
  "TRELLO_PLUGIN_DATA_UNAVAILABLE",
  "TRELLO_UPSTREAM_FAILURE",
  "TOTAL_OVERFLOW",
]);

const safeErrorNames = new Set([
  "AbortError",
  "Error",
  "RangeError",
  "ReconciliationConflictError",
  "SyntaxError",
  "TrelloApiError",
  "TypeError",
]);

const safeStages = new Set([
  "trello_read",
  "amazing_fields_config",
  "paid_card_validation",
  "telegram_notification",
  "result_card_write",
]);

function safeFieldValue(value: string | number | boolean): string | number | boolean {
  if (typeof value === "string") {
    return value.slice(0, 160);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  return value;
}

function isSafeField(key: string, value: string | number | boolean): boolean {
  if (key === "code") {
    return typeof value === "string" && safeCodes.has(value);
  }
  if (key === "notificationStatus") {
    return value === "sent" || value === "failed";
  }
  if (key === "path") {
    return (
      typeof value === "string" &&
      ["/health", "/v1/config-check", "/v1/reconcile", "unmatched"].includes(
        value,
      )
    );
  }
  if (key === "caller") {
    return value === "button" || value === "cron";
  }
  if (key === "method") {
    return (
      typeof value === "string" &&
      ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
        value,
      )
    );
  }
  if (key === "requestId") {
    return (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    );
  }
  if (key === "errorName") {
    return typeof value === "string" && safeErrorNames.has(value);
  }
  if (key === "stage") {
    return typeof value === "string" && safeStages.has(value);
  }
  if (key === "status") {
    return (
      (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) ||
      (typeof value === "string" &&
        ["passed", "failed", "not_tested"].includes(value))
    );
  }
  return true;
}

function emit(
  level: LogLevel,
  event: string,
  fields: LogFields | undefined,
  write: (level: LogLevel, line: string) => void,
): void {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (
      safeFields.has(key) &&
      value !== undefined &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean") &&
      isSafeField(key, value)
    ) {
      safe[key] = safeFieldValue(value);
    }
  }

  write(
    level,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event: safeEvents.has(event) ? event : "http.request.completed",
      ...safe,
    }),
  );
}

export function createServerLogger(
  write: (level: LogLevel, line: string) => void = (level, line) => {
    if (level === "error") {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  },
): ServerLogger {
  return {
    info: (event, fields) => emit("info", event, fields, write),
    warn: (event, fields) => emit("warn", event, fields, write),
    error: (event, fields) => emit("error", event, fields, write),
  };
}

export const serverLogger = createServerLogger();
