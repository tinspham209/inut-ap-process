import { describe, expect, it, vi } from "vitest";
import {
  createApp,
  type ReconciliationExecution,
  type ReconciliationSuccessBody,
} from "../src/app.js";
import { createServerLogger, type LogLevel } from "../src/logger.js";

const config = {
  reconcileCronSecret: "synthetic-cron-secret",
  reconcileButtonSecret: "synthetic-button-secret",
};

const successBody: ReconciliationSuccessBody = {
  status: "success",
  month: "09/2026",
  asOf: "2026-09-29T12:00:00.000Z",
  totalSpentVnd: 5_000_000,
  cashSpentVnd: 2_000_000,
  bankTransferSpentVnd: 3_000_000,
  spentByExpenseType: [
    { expenseType: "Synthetic category A", spentVnd: 2_000_000 },
    { expenseType: "Synthetic category B", spentVnd: 3_000_000 },
  ],
  updatedCardUrl: "https://trello.com/c/AbCd1234",
};

const successExecution: ReconciliationExecution = {
  ok: true,
  body: successBody,
};

function authorization(secret: string): HeadersInit {
  return { Authorization: `Bearer ${secret}` };
}

function createTestApp(
  execute: () => Promise<ReconciliationExecution>,
  now: () => number = () => 0,
  overrides: Partial<Parameters<typeof createApp>[0]> = {},
) {
  const quietLogger = createServerLogger(() => {});
  return createApp({
    config,
    executeReconciliation: execute,
    now,
    logger: quietLogger,
    ...overrides,
  });
}

function captureLogs() {
  const lines: Array<{ level: LogLevel; line: string }> = [];
  const logger = createServerLogger((level, line) => {
    lines.push({ level, line });
  });
  return { logger, lines };
}

describe("reconciliation HTTP API", () => {
  it("serves health without invoking reconciliation", async () => {
    const execute = vi.fn(async () => successExecution);
    const app = createTestApp(execute);

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("accepts Trello's empty JSON object payload", async () => {
    const execute = vi.fn(async () => successExecution);
    const app = createTestApp(execute);

    const response = await app.request("/v1/reconcile", {
      method: "POST",
      headers: {
        ...authorization(config.reconcileButtonSecret),
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects payload fields and invalid authorization without I/O", async () => {
    const execute = vi.fn(async () => successExecution);
    const { logger, lines } = captureLogs();
    const app = createTestApp(execute, undefined, { logger });
    const bodySentinel = "synthetic-request-payload";

    const invalidBody = await app.request("/v1/reconcile", {
      method: "POST",
      headers: {
        ...authorization(config.reconcileButtonSecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ marker: bodySentinel }),
    });
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.headers.get("X-Request-Id")).toBeTruthy();
    expect(await invalidBody.json()).toMatchObject({
      code: "INVALID_REQUEST",
      reason: "BODY_MUST_BE_EMPTY_OR_EMPTY_OBJECT",
      message:
        "POST /v1/reconcile accepts an empty body or {} only. Remove all payload fields.",
    });

    const invalidAuth = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization("wrong-secret"),
    });
    expect(invalidAuth.status).toBe(401);
    expect(await invalidAuth.json()).toMatchObject({
      code: "UNAUTHORIZED",
      reason: "AUTHORIZATION_INVALID",
    });

    const missingAuth = await app.request("/v1/reconcile", {
      method: "POST",
    });
    expect(missingAuth.status).toBe(401);
    expect(await missingAuth.json()).toMatchObject({
      code: "UNAUTHORIZED",
      reason: "AUTHORIZATION_MISSING",
    });
    expect(execute).not.toHaveBeenCalled();
    const logOutput = lines.map(({ line }) => line).join("\n");
    expect(logOutput).toContain('"code":"INVALID_REQUEST"');
    expect(logOutput).toContain('"bodyLength":');
    expect(logOutput).not.toContain(bodySentinel);
  });

  it("does not let query parameters classify a button request as cron", async () => {
    const { logger, lines } = captureLogs();
    const execute = vi
      .fn<() => Promise<ReconciliationExecution>>()
      .mockResolvedValueOnce(successExecution)
      .mockResolvedValueOnce(successExecution);
    const app = createTestApp(execute, undefined, { logger });

    await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });
    const response = await app.request(
      "/v1/reconcile?source=cron",
      {
        method: "POST",
        headers: authorization(config.reconcileButtonSecret),
      },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(execute).toHaveBeenCalledTimes(1);
    const output = lines.map(({ line }) => line).join("\n");
    expect(output).toContain('"code":"BUTTON_COOLDOWN"');
    expect(output).toContain('"reason":"BUTTON_COOLDOWN_ACTIVE"');
    expect(output).not.toContain("source=cron");
  });

  it("starts the button cooldown when a successful request completes", async () => {
    let now = 0;
    const execute = vi.fn(async () => {
      now = 100;
      return successExecution;
    });
    const app = createTestApp(execute, () => now);

    const first = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(successBody);

    now = 60_099;
    const early = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });
    expect(early.status).toBe(429);
    expect(early.headers.get("Retry-After")).toBe("1");
    expect(execute).toHaveBeenCalledTimes(1);

    now = 60_100;
    const boundary = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });
    expect(boundary.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("allows cron during button cooldown but does not bypass the active-run lock", async () => {
    let now = 0;
    const execute = vi.fn(async () => {
      now = 100;
      return successExecution;
    });
    const app = createTestApp(execute, () => now);

    await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });
    const cron = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileCronSecret),
    });
    expect(cron.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(2);

    let release: (value: ReconciliationExecution) => void = () => {};
    const pending = createTestApp(
      () =>
        new Promise<ReconciliationExecution>((resolve) => {
          release = resolve;
        }),
      () => now,
    );
    const running = pending.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileCronSecret),
    });
    await Promise.resolve();
    const overlapping = await pending.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });
    expect(overlapping.status).toBe(409);
    release(successExecution);
    expect((await running).status).toBe(200);
  });

  it("does not create cooldown after a failed run and does not accept an invalid 200 body", async () => {
    const { logger, lines } = captureLogs();
    let calls = 0;
    const execute = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? {
            ok: false as const,
            status: 422 as const,
            body: { status: "error", code: "INVALID_PAID_CARD_DATA" },
          }
        : {
            ok: true as const,
            body: {
              ...successBody,
              totalSpentVnd: 6_000_000,
            },
          };
    });
    const app = createTestApp(execute, undefined, { logger });

    const failed = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });
    expect(failed.status).toBe(422);

    const invalidSuccess = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });
    expect(invalidSuccess.status).toBe(502);
    expect(execute).toHaveBeenCalledTimes(2);
    const output = lines.map(({ line }) => line).join("\n");
    expect(output).toContain('"code":"INVALID_RECONCILIATION_RESULT"');
    expect(output).not.toContain(
      '"code":"RECONCILIATION_SUCCEEDED","issueCount":0',
    );
  });

  it("does not share the in-memory cooldown across app restarts", async () => {
    const execute = vi.fn(async () => successExecution);
    const firstInstance = createTestApp(execute);
    const restartedInstance = createTestApp(execute);

    await firstInstance.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });
    const afterRestart = await restartedInstance.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });

    expect(afterRestart.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: "a category sum that does not equal the total",
      mutate(body: ReconciliationSuccessBody) {
        return { ...body, spentByExpenseType: [{ expenseType: "A", spentVnd: 1 }] };
      },
    },
    {
      name: "a duplicate category name",
      mutate(body: ReconciliationSuccessBody) {
        return {
          ...body,
          spentByExpenseType: [
            { expenseType: "A", spentVnd: 2_000_000 },
            { expenseType: "A", spentVnd: 3_000_000 },
          ],
        };
      },
    },
    {
      name: "a zero-valued category entry",
      mutate(body: ReconciliationSuccessBody) {
        return {
          ...body,
          spentByExpenseType: [
            { expenseType: "A", spentVnd: 5_000_000 },
            { expenseType: "B", spentVnd: 0 },
          ],
        };
      },
    },
    {
      name: "a category entry with a blank name",
      mutate(body: ReconciliationSuccessBody) {
        return {
          ...body,
          spentByExpenseType: [{ expenseType: "  ", spentVnd: 5_000_000 }],
        };
      },
    },
    {
      name: "a category entry with a non-integer amount",
      mutate(body: ReconciliationSuccessBody) {
        return {
          ...body,
          spentByExpenseType: [
            { expenseType: "Synthetic category A", spentVnd: 2_000_000.5 },
            { expenseType: "Synthetic category B", spentVnd: 2_999_999.5 },
          ],
        };
      },
    },
  ])("rejects $name before reporting success", async ({ mutate }) => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      body: mutate(successBody),
    }));
    const app = createTestApp(execute);

    const response = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: "INVALID_RECONCILIATION_RESULT",
    });
  });

  it("accepts an empty category array when all monthly totals are zero", async () => {
    const emptyReport: ReconciliationSuccessBody = {
      ...successBody,
      totalSpentVnd: 0,
      cashSpentVnd: 0,
      bankTransferSpentVnd: 0,
      spentByExpenseType: [],
    };
    const app = createTestApp(async () => ({
      ok: true,
      body: emptyReport,
    }));

    const response = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      totalSpentVnd: 0,
      spentByExpenseType: [],
    });
  });

  it("rejects a success response missing the required category breakdown", async () => {
    const missingBreakdown = new Proxy(successBody, {
      get(target, property, receiver) {
        if (property === "spentByExpenseType") {
          return undefined;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const app = createTestApp(async () => ({
      ok: true,
      body: missingBreakdown,
    }));

    const response = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: "INVALID_RECONCILIATION_RESULT",
    });
  });

  it("authenticates the read-only configuration check and does not reconcile", async () => {
    const execute = vi.fn(async () => successExecution);
    const checkConfiguration = vi.fn(async () => ({
      ready: true,
      checks: [
        { name: "environment" as const, status: "passed" as const },
        {
          name: "trello_access_and_targets" as const,
          status: "passed" as const,
        },
        {
          name: "amazing_fields_board_config" as const,
          status: "passed" as const,
        },
        {
          name: "telegram_configuration" as const,
          status: "configured_not_tested" as const,
        },
      ],
    }));
    const app = createTestApp(execute, undefined, { checkConfiguration });

    const unauthorized = await app.request("/v1/config-check");
    expect(unauthorized.status).toBe(401);
    expect(checkConfiguration).not.toHaveBeenCalled();

    const response = await app.request("/v1/config-check?debug=sentinel", {
      headers: authorization(config.reconcileButtonSecret),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    expect(await response.json()).toMatchObject({
      status: "ready",
      checks: [
        { name: "environment", status: "passed" },
        { name: "trello_access_and_targets", status: "passed" },
        { name: "amazing_fields_board_config", status: "passed" },
        {
          name: "telegram_configuration",
          status: "configured_not_tested",
        },
      ],
    });
    expect(execute).not.toHaveBeenCalled();
    expect(checkConfiguration).toHaveBeenCalledTimes(1);
  });

  it("reports safe check codes when configuration verification fails", async () => {
    const { logger, lines } = captureLogs();
    const app = createTestApp(
      vi.fn(async () => successExecution),
      undefined,
      {
        logger,
        checkConfiguration: async () => ({
          ready: false,
          checks: [
            {
              name: "trello_access_and_targets",
              status: "failed",
              code: "TRELLO_ACCESS_OR_TARGET_INVALID",
            },
          ],
        }),
      },
    );

    const response = await app.request("/v1/config-check", {
      headers: authorization(config.reconcileCronSecret),
    });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("TRELLO_ACCESS_OR_TARGET_INVALID");
    expect(body).not.toContain(config.reconcileCronSecret);
    expect(lines.join("\n")).not.toContain(config.reconcileCronSecret);
  });

  it("does not expose configuration-check exceptions in the response or logs", async () => {
    const { logger, lines } = captureLogs();
    const sentinel = "synthetic-config-secret-value";
    const app = createTestApp(
      vi.fn(async () => successExecution),
      undefined,
      {
        logger,
        checkConfiguration: async () => {
          throw new Error(sentinel);
        },
      },
    );

    const response = await app.request("/v1/config-check", {
      headers: authorization(config.reconcileButtonSecret),
    });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("CONFIGURATION_CHECK_FAILED");
    expect(body).not.toContain(sentinel);
    expect(lines.map(({ line }) => line).join("\n")).not.toContain(sentinel);
  });

  it("logs safe upstream HTTP status with reconciliation failure code", async () => {
    const { logger, lines } = captureLogs();
    const app = createTestApp(
      async () => ({
        ok: false,
        status: 502,
        body: { status: "error", code: "TRELLO_UPSTREAM_FAILURE" },
        logContext: { upstreamStatus: 401 },
      }),
      undefined,
      { logger },
    );

    const response = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });
    const output = lines.map(({ line }) => line).join("\n");

    expect(response.status).toBe(502);
    expect(output).toContain('"upstreamStatus":401');
    expect(output).toContain('"code":"TRELLO_UPSTREAM_FAILURE"');
  });

  it("logs request outcomes without query strings, authorization, or request data", async () => {
    const { logger, lines } = captureLogs();
    const app = createTestApp(
      vi.fn(async () => successExecution),
      undefined,
      { logger },
    );
    const sentinel = "synthetic-sensitive-sentinel";

    const response = await app.request(`/health?token=${sentinel}`, {
      headers: authorization(config.reconcileButtonSecret),
    });
    const logs = lines.map(({ line }) => line).join("\n");

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    expect(logs).toContain('"event":"http.request.started"');
    expect(logs).toContain('"event":"http.request.completed"');
    expect(logs).toContain('"path":"/health"');
    expect(logs).not.toContain(sentinel);
    expect(logs).not.toContain(config.reconcileButtonSecret);
  });

  it("returns a generic 500 and logs no unhandled error message", async () => {
    const { logger, lines } = captureLogs();
    const sentinel = "synthetic-sensitive-exception-detail";
    const app = createTestApp(
      async () => {
        throw new Error(sentinel);
      },
      undefined,
      { logger },
    );

    const response = await app.request("/v1/reconcile", {
      method: "POST",
      headers: authorization(config.reconcileButtonSecret),
    });
    const body = await response.text();
    const logs = lines.map(({ line }) => line).join("\n");

    expect(response.status).toBe(500);
    expect(body).toContain("INTERNAL_SERVER_ERROR");
    expect(body).not.toContain(sentinel);
    expect(logs).toContain('"event":"http.request.unhandled_error"');
    expect(logs).not.toContain(sentinel);
  });
});
