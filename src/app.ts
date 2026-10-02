import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { ConfigCheckResult } from "./config-check.js";
import type { AppConfig } from "./config.js";
import {
  serverLogger,
  type ServerLogger,
} from "./logger.js";
import { ReconciliationConflictError } from "./reconcile.js";
import type { ResultCardReport } from "./result-card.js";
import { TrelloApiError } from "./trello/client.js";

export interface ReconciliationSuccessBody extends ResultCardReport {
  status: "success";
  updatedCardUrl: string;
}

export type ReconciliationExecution =
  | { ok: true; body: ReconciliationSuccessBody }
  | {
      ok: false;
      status: 422 | 502 | 503;
      body: Record<string, unknown>;
      logContext?: { upstreamStatus?: number };
    };

export interface ReconciliationAppOptions {
  config: Pick<
    AppConfig,
    "reconcileCronSecret" | "reconcileButtonSecret"
  >;
  executeReconciliation: (requestId: string) => Promise<ReconciliationExecution>;
  checkConfiguration?: () => Promise<ConfigCheckResult>;
  now?: () => number;
  logger?: ServerLogger;
}

type AppEnvironment = {
  Variables: {
    requestId: string;
  };
};

function secureSecretMatch(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith("Bearer ")) {
    return false;
  }
  const provided = Buffer.from(header.slice("Bearer ".length));
  const configured = Buffer.from(expected);
  return (
    provided.length === configured.length &&
    timingSafeEqual(provided, configured)
  );
}

function isEmptyReconciliationBody(body: string): boolean {
  if (body.trim().length === 0) {
    return true;
  }

  try {
    const parsed: unknown = JSON.parse(body);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 0
    );
  } catch {
    return false;
  }
}

function isTrelloCardUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const path = url.pathname.split("/").filter(Boolean);
    return (
      url.protocol === "https:" &&
      url.hostname === "trello.com" &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.port.length === 0 &&
      path[0] === "c" &&
      /^[A-Za-z0-9]{8}$/.test(path[1] ?? "")
    );
  } catch {
    return false;
  }
}

function isValidSuccessBody(
  body: ReconciliationSuccessBody,
): boolean {
  const amounts = [
    body.totalSpentVnd,
    body.cashSpentVnd,
    body.bankTransferSpentVnd,
  ];
  if (
    body.status !== "success" ||
    !/^(0[1-9]|1[0-2])\/\d{4}$/.test(body.month) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      body.asOf,
    ) ||
    !Number.isFinite(Date.parse(body.asOf)) ||
    amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0) ||
    !isTrelloCardUrl(body.updatedCardUrl)
  ) {
    return false;
  }
  return (
    BigInt(body.totalSpentVnd) ===
    BigInt(body.cashSpentVnd) + BigInt(body.bankTransferSpentVnd)
  );
}

function safeRoute(path: string): string {
  const pathname = path.split("?", 1)[0];
  return [
    "/health",
    "/v1/config-check",
    "/v1/reconcile",
  ].includes(pathname)
    ? pathname
    : "unmatched";
}

function durationInMilliseconds(value: string): number | undefined {
  const match = /^([\d,.]+)(ms|s)$/.exec(value);
  if (!match) {
    return undefined;
  }
  const number = Number(match[1]?.replaceAll(",", ""));
  if (!Number.isFinite(number)) {
    return undefined;
  }
  return Math.max(0, Math.round(match[2] === "s" ? number * 1000 : number));
}

function logHonoRequestLine(
  line: string,
  requestId: string,
  logger: ServerLogger,
): void {
  const sanitizedLine = line.replace(/\u001b\[[0-9;]*m/g, "");
  const incoming = /^<-- (\S+) (\S+)$/.exec(sanitizedLine);
  if (incoming) {
    logger.info("http.request.started", {
      requestId,
      method: incoming[1],
      path: safeRoute(incoming[2] ?? ""),
    });
    return;
  }

  const outgoing = /^--> (\S+) (\S+) (\d{3}) ([\d,.]+(?:ms|s))$/.exec(
    sanitizedLine,
  );
  if (!outgoing) {
    logger.warn("http.request.completed", {
      requestId,
      code: "INVALID_HONO_LOG_LINE",
    });
    return;
  }

  const status = Number(outgoing[3]);
  const durationMs = durationInMilliseconds(outgoing[4] ?? "");
  const fields = {
    requestId,
    method: outgoing[1],
    path: safeRoute(outgoing[2] ?? ""),
    status,
    ...(durationMs === undefined ? {} : { durationMs }),
  };
  if (status >= 500) {
    logger.error("http.request.completed", fields);
  } else if (status >= 400) {
    logger.warn("http.request.completed", fields);
  } else {
    logger.info("http.request.completed", fields);
  }
}

export function createApp(options?: ReconciliationAppOptions): Hono<AppEnvironment> {
  const app = new Hono<AppEnvironment>();
  const logger = options?.logger ?? serverLogger;

  app.use("*", async (context, next) => {
    const requestId = randomUUID();
    context.header("X-Request-Id", requestId);
    context.set("requestId", requestId);
    await honoLogger((line) =>
      logHonoRequestLine(line, requestId, logger),
    )(context, next);
  });

  app.onError((error, context) => {
    const requestId = context.get("requestId");
    logger.error("http.request.unhandled_error", {
      requestId,
      method: context.req.method,
      path: safeRoute(context.req.path),
      code: "INTERNAL_SERVER_ERROR",
      errorName:
        error instanceof Error &&
        /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name)
          ? error.name
          : "Error",
    });
    const response = context.json(
      {
        status: "error",
        code: "INTERNAL_SERVER_ERROR",
        requestId,
      },
      500,
    );
    if (requestId) {
      response.headers.set("X-Request-Id", requestId);
    }
    return response;
  });

  app.get("/health", (context) => context.json({ status: "ok" }));

  if (options) {
    const now = options.now ?? Date.now;
    let running = false;
    let lastSuccessfulButtonRunAt: number | undefined;

    app.get("/v1/config-check", async (context) => {
      const authorization = context.req.header("Authorization");
      const authorized =
        secureSecretMatch(authorization, options.config.reconcileCronSecret) ||
        secureSecretMatch(
          authorization,
          options.config.reconcileButtonSecret,
        );
      if (!authorized) {
        return context.json(
          { status: "error", code: "UNAUTHORIZED" },
          401,
        );
      }

      if (!options.checkConfiguration) {
        logger.error("configuration.check.failed", {
          requestId: context.get("requestId"),
          code: "CONFIGURATION_CHECK_UNAVAILABLE",
        });
        return context.json(
          { status: "error", code: "CONFIGURATION_CHECK_UNAVAILABLE" },
          503,
        );
      }

      const requestId = context.get("requestId") as string;
      try {
        const result = await options.checkConfiguration();
        const failedCheckCount = result.checks.filter(
          (check) => check.status === "failed",
        ).length;
        const failedCheck = result.checks.find(
          (check) => check.status === "failed",
        );
        const checkFields = {
          requestId,
          status: result.ready ? 200 : 503,
          checkCount: result.checks.length,
          failedCheckCount,
          code:
            failedCheck?.code ??
            (result.ready
              ? "CONFIGURATION_READY"
              : "CONFIGURATION_NOT_READY"),
          ...(failedCheck?.upstreamStatus
            ? { upstreamStatus: failedCheck.upstreamStatus }
            : {}),
        };
        if (result.ready) {
          logger.info("configuration.check.completed", checkFields);
        } else {
          logger.warn("configuration.check.completed", checkFields);
        }
        return context.json(
          {
            status: result.ready ? "ready" : "not_ready",
            checks: result.checks,
          },
          result.ready ? 200 : 503,
        );
      } catch {
        logger.error("configuration.check.failed", {
          requestId,
          code: "CONFIGURATION_CHECK_FAILED",
        });
        return context.json(
          {
            status: "not_ready",
            code: "CONFIGURATION_CHECK_FAILED",
          },
          503,
        );
      }
    });

    app.post("/v1/reconcile", async (context) => {
      const authorization = context.req.header("Authorization");
      const caller = secureSecretMatch(
        authorization,
        options.config.reconcileCronSecret,
      )
        ? "cron"
        : secureSecretMatch(
              authorization,
              options.config.reconcileButtonSecret,
            )
          ? "button"
          : undefined;
      if (!caller) {
        const requestId = context.get("requestId");
        const reason = authorization
          ? "AUTHORIZATION_INVALID"
          : "AUTHORIZATION_MISSING";
        logger.warn("reconciliation.request_rejected", {
          requestId,
          code: "UNAUTHORIZED",
          reason,
        });
        return context.json(
          {
            status: "error",
            code: "UNAUTHORIZED",
            reason,
            message: "Authorization must use a configured Bearer secret.",
            requestId,
          },
          401,
        );
      }

      const body = await context.req.text();
      if (!isEmptyReconciliationBody(body)) {
        const requestId = context.get("requestId");
        const bodyLength = Buffer.byteLength(body, "utf8");
        logger.warn("reconciliation.request_rejected", {
          requestId,
          code: "INVALID_REQUEST",
          reason: "BODY_MUST_BE_EMPTY_OR_EMPTY_OBJECT",
          bodyLength,
        });
        return context.json(
          {
            status: "error",
            code: "INVALID_REQUEST",
            reason: "BODY_MUST_BE_EMPTY_OR_EMPTY_OBJECT",
            message:
              "POST /v1/reconcile accepts an empty body or {} only. Remove all payload fields.",
            requestId,
          },
          400,
        );
      }
      if (running) {
        return context.json(
          { status: "error", code: "RECONCILIATION_IN_PROGRESS" },
          409,
        );
      }

      const requestStartedAt = now();
      if (caller === "button" && lastSuccessfulButtonRunAt !== undefined) {
        const remainingMs =
          60_000 - (requestStartedAt - lastSuccessfulButtonRunAt);
        if (remainingMs > 0) {
          return context.json(
            { status: "error", code: "BUTTON_COOLDOWN" },
            429,
            { "Retry-After": String(Math.ceil(remainingMs / 1000)) },
          );
        }
      }

      running = true;
      const requestId = context.get("requestId") as string;
      const runStartedAt = performance.now();
      logger.info("reconciliation.started", {
        requestId,
        caller,
      });
      try {
        const execution = await options.executeReconciliation(requestId);
        const failureBody = execution.ok ? undefined : execution.body;
        const issueCount =
          failureBody && Array.isArray(failureBody.issues)
            ? failureBody.issues.length
            : 0;
        const notificationStatus =
          typeof failureBody?.notification === "object" &&
          failureBody.notification !== null &&
          "status" in failureBody.notification &&
          typeof failureBody.notification.status === "string"
            ? failureBody.notification.status
            : undefined;
        const responseCode =
          typeof failureBody?.code === "string" &&
          /^[A-Z0-9_]{1,80}$/.test(failureBody.code)
            ? failureBody.code
            : execution.ok
              ? "RECONCILIATION_SUCCEEDED"
              : "RECONCILIATION_FAILED";
        const outcomeFields = {
          requestId,
          caller,
          status: execution.ok ? 200 : execution.status,
          durationMs: Math.max(
            0,
            Math.round(performance.now() - runStartedAt),
          ),
          code: responseCode,
          ...(!execution.ok && execution.logContext?.upstreamStatus
            ? { upstreamStatus: execution.logContext.upstreamStatus }
            : {}),
          issueCount,
          ...(notificationStatus ? { notificationStatus } : {}),
        };
        if (execution.ok) {
          logger.info("reconciliation.completed", outcomeFields);
        } else {
          logger.warn("reconciliation.completed", outcomeFields);
        }
        if (!execution.ok) {
          return context.json(execution.body, execution.status);
        }
        if (!isValidSuccessBody(execution.body)) {
          return context.json(
            { status: "error", code: "INVALID_RECONCILIATION_RESULT" },
            502,
          );
        }
        if (caller === "button") {
          lastSuccessfulButtonRunAt = now();
        }
        return context.json(execution.body, 200);
      } catch (error) {
        if (error instanceof ReconciliationConflictError) {
          logger.warn("reconciliation.completed", {
            requestId,
            caller,
            status: 409,
            code: "RECONCILIATION_CONFLICT",
            durationMs: Math.max(
              0,
              Math.round(performance.now() - runStartedAt),
            ),
          });
          return context.json(
            { status: "error", code: "RECONCILIATION_CONFLICT" },
            409,
          );
        }
        if (error instanceof TrelloApiError) {
          const status =
            error.status === 429 || error.status >= 500 ? 503 : 502;
          logger.error("reconciliation.completed", {
            requestId,
            caller,
            status,
            code: "TRELLO_UPSTREAM_FAILURE",
            durationMs: Math.max(
              0,
              Math.round(performance.now() - runStartedAt),
            ),
          });
          return context.json(
            { status: "error", code: "TRELLO_UPSTREAM_FAILURE" },
            status,
          );
        }
        throw error;
      } finally {
        running = false;
      }
    });
  }

  return app;
}

export const app = createApp();
