import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createServerLogger } from "../src/logger.js";
import { executeReconciliation } from "../src/reconcile.js";
import {
  createTrelloClient,
  type TrelloCard,
  type TrelloPluginData,
} from "../src/trello/client.js";
import {
  SlidingWindowRateLimiter,
  type RequestRateLimiter,
} from "../src/trello/rate-limit.js";
import {
  fieldIds,
  makeAmazingFieldsFixture,
  syntheticPluginId,
  validCardData,
  validConfig,
} from "./fixtures/amazing-fields.js";

const testTime = new Date("2026-09-29T12:00:00.000Z");
const boardIdInput = "Board1234";
const canonicalBoardId = "canonical-board-id";
const paidListId = "synthetic-paid-list-id";
const resultListId = "synthetic-result-list-id";
const resultCardIdInput = "Resu1234";
const canonicalResultCardId = "canonical-result-card-id";

type FetchImplementation = (input: URL, init: RequestInit) => Promise<Response>;

afterEach(() => {
  vi.useRealTimers();
});

interface CardSpec {
  id: string;
  cardData?: Record<string, unknown>;
  name?: string;
  closed?: boolean;
  idList?: string;
}

interface ScenarioOptions {
  cards?: CardSpec[];
  config?: Record<string, unknown>;
  resultBoardId?: string;
  resultListId?: string;
  putMode?: "success" | "commit_then_timeout" | "fail_before_commit";
  telegramStatus?: number;
  telegramOk?: boolean;
  mutateCardPluginDataOnSecondRead?: string;
  transient429CardId?: string;
  always429CardId?: string;
  resultDescription?: string;
  rateLimiter?: RequestRateLimiter;
  maxAttempts?: number;
}

function sourceCard(spec: CardSpec, index: number): TrelloCard {
  const shortLink = `P${String(index + 1).padStart(7, "0")}`;
  return {
    id: spec.id,
    name: spec.name ?? "Synthetic AP card",
    idBoard: canonicalBoardId,
    idList: spec.idList ?? paidListId,
    closed: spec.closed ?? false,
    shortLink,
    url: `https://trello.com/c/${shortLink}/synthetic-title`,
  };
}

function pluginDataForCard(cardData: Record<string, unknown>): TrelloPluginData[] {
  return makeAmazingFieldsFixture({ card: cardData }).cardPluginData;
}

function defaultCardData(
  amountVnd = 2_000_000,
  method: "Tiền mặt" | "Chuyển khoản" = "Tiền mặt",
): Record<string, unknown> {
  return {
    ...validCardData,
    __boardId: canonicalBoardId,
    [fieldIds.amount]: amountVnd,
    [fieldIds.paymentMethod]: [
      method === "Tiền mặt" ? fieldIds.cashOption : fieldIds.transferOption,
    ],
  };
}

function createScenario(options: ScenarioOptions = {}) {
  const defaultPluginData = pluginDataForCard(defaultCardData());
  const configuredFields = {
    ...(options.config ?? validConfig),
    boardId: canonicalBoardId,
  };
  const fixture = makeAmazingFieldsFixture({
    config: configuredFields,
  });
  const specs = options.cards ?? [
    { id: "synthetic-paid-card-1", cardData: defaultCardData() },
  ];
  const cards = specs.map((spec, index) => sourceCard(spec, index));
  const cardPluginData = new Map(
    specs.map((spec) => [
      spec.id,
      spec.cardData ? pluginDataForCard(spec.cardData) : defaultPluginData,
    ]),
  );
  const state = {
    resultDescription: options.resultDescription ?? "Owner note\n\nFooter",
    resultBoardId: options.resultBoardId ?? canonicalBoardId,
    resultListId: options.resultListId ?? resultListId,
    putMode: options.putMode ?? "success",
    telegramStatus: options.telegramStatus,
    telegramOk: options.telegramOk ?? true,
    mutateCardPluginDataOnSecondRead:
      options.mutateCardPluginDataOnSecondRead,
    transient429CardId: options.transient429CardId,
    always429CardId: options.always429CardId,
    cardDataReadCounts: new Map<string, number>(),
    cardDataRead429Sent: new Set<string>(),
    telegramCalls: [] as string[],
    calls: [] as Array<{ method: string; path: string }>,
    putTargets: [] as string[],
    logs: [] as string[],
  };
  const logger = createServerLogger((_level, line) => {
    state.logs.push(line);
  });

  const resultCardRecord = () => ({
    id: canonicalResultCardId,
    name: "Synthetic result",
    idBoard: state.resultBoardId,
    idList: state.resultListId,
    closed: false,
    shortLink: resultCardIdInput,
    url: `https://trello.com/c/${resultCardIdInput}`,
    desc: state.resultDescription,
  });

  const trelloFetch: FetchImplementation = async (url, init) => {
    const method = init.method ?? "GET";
    state.calls.push({ method, path: url.pathname });

    if (method === "PUT") {
      state.putTargets.push(url.pathname);
      if (url.pathname !== `/1/cards/${canonicalResultCardId}`) {
        return Response.json({ error: "unexpected write target" }, { status: 400 });
      }
      const body = JSON.parse(String(init.body)) as { desc?: string };
      if (typeof body.desc !== "string") {
        return Response.json({ error: "missing description" }, { status: 400 });
      }
      if (state.putMode === "fail_before_commit") {
        return new Response("", { status: 503 });
      }
      state.resultDescription = body.desc;
      if (state.putMode === "commit_then_timeout") {
        throw new Error("synthetic connection loss");
      }
      return Response.json(resultCardRecord());
    }

    if (url.pathname === `/1/boards/${boardIdInput}`) {
      return Response.json({
        id: canonicalBoardId,
        shortLink: boardIdInput,
      });
    }
    if (url.pathname === `/1/boards/${canonicalBoardId}/lists`) {
      return Response.json([
        { id: paidListId, name: "Paid", closed: false },
        { id: resultListId, name: "Results", closed: false },
      ]);
    }
    if (
      url.pathname === `/1/cards/${resultCardIdInput}` ||
      url.pathname === `/1/cards/${canonicalResultCardId}`
    ) {
      return Response.json(resultCardRecord());
    }
    if (url.pathname === `/1/boards/${canonicalBoardId}/pluginData`) {
      return Response.json(fixture.boardPluginData);
    }
    if (url.pathname === `/1/boards/${canonicalBoardId}/cards/all`) {
      return Response.json([...cards, resultCardRecord()]);
    }
    const pluginDataPrefix = "/1/cards/";
    if (
      url.pathname.startsWith(pluginDataPrefix) &&
      url.pathname.endsWith("/pluginData")
    ) {
      const cardId = decodeURIComponent(
        url.pathname.slice(pluginDataPrefix.length, -"/pluginData".length),
      );
      const count = (state.cardDataReadCounts.get(cardId) ?? 0) + 1;
      state.cardDataReadCounts.set(cardId, count);
      if (cardId === state.always429CardId) {
        return new Response("", { status: 429 });
      }
      if (
        cardId === state.transient429CardId &&
        count === 2 &&
        !state.cardDataRead429Sent.has(cardId)
      ) {
        state.cardDataRead429Sent.add(cardId);
        return new Response("", {
          status: 429,
          headers: { "Retry-After": "0" },
        });
      }
      if (
        cardId === state.mutateCardPluginDataOnSecondRead &&
        count === 2
      ) {
        const current = cardPluginData.get(cardId) ?? defaultPluginData;
        const changedCard = {
          ...validCardData,
          [fieldIds.amount]: 9_999,
        };
        const changed = pluginDataForCard(changedCard);
        return Response.json(changed.length ? changed : current);
      }
      return Response.json(
        cardPluginData.get(cardId) ?? defaultPluginData,
      );
    }
    return Response.json({ error: "not found" }, { status: 404 });
  };

  const telegramFetch: FetchImplementation = async (_url, init) => {
    const body = JSON.parse(String(init.body)) as { text: string };
    state.telegramCalls.push(body.text);
    if (state.telegramStatus !== undefined) {
      return new Response("", { status: state.telegramStatus });
    }
    return Response.json({ ok: state.telegramOk });
  };

  const client = createTrelloClient({
    apiKey: "synthetic-api-key",
    apiToken: "synthetic-api-token",
    boardId: boardIdInput,
    paidListId,
    resultCardId: resultCardIdInput,
    fetchImpl: trelloFetch,
    rateLimiter: options.rateLimiter ?? { acquire: async () => {} },
    maxAttempts: options.maxAttempts ?? 1,
    retryDelayMs: 1,
    maxRetryDelayMs: 10,
    sleep: async () => {},
    random: () => 1,
  });
  const execute = (requestId: string) =>
    executeReconciliation({
      client,
      pluginId: syntheticPluginId,
      requestId,
      logger,
      telegram: {
        botToken: "synthetic-telegram-token",
        chatId: "synthetic-chat-id",
        fetchImpl: telegramFetch,
        maxAttempts: 1,
        sleep: async () => {},
      },
      now: () => new Date(testTime),
    });
  const app = createApp({
    config: {
      reconcileCronSecret: "synthetic-cron-secret",
      reconcileButtonSecret: "synthetic-button-secret",
    },
    executeReconciliation: execute,
    now: () => 0,
    logger: createServerLogger(() => {}),
  });

  return { app, state, execute };
}

async function postReconcile(app: ReturnType<typeof createApp>) {
  return app.request("/v1/reconcile", {
    method: "POST",
    headers: { Authorization: "Bearer synthetic-button-secret" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("full reconciliation integration with fake HTTP", () => {
  it("returns 5/2/3 million only after one result-card PUT", async () => {
    const scenario = createScenario({
      cards: [
        {
          id: "synthetic-cash-card",
          cardData: defaultCardData(2_000_000, "Tiền mặt"),
        },
        {
          id: "synthetic-bank-card",
          cardData: defaultCardData(3_000_000, "Chuyển khoản"),
        },
        {
          id: "synthetic-discard-card",
          idList: "synthetic-discard-list",
          cardData: defaultCardData(99_000_000, "Tiền mặt"),
        },
      ],
    });

    const response = await postReconcile(scenario.app);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "success",
      month: "09/2026",
      asOf: "2026-09-29T12:00:00.000Z",
      totalSpentVnd: 5_000_000,
      cashSpentVnd: 2_000_000,
      bankTransferSpentVnd: 3_000_000,
      updatedCardUrl: `https://trello.com/c/${resultCardIdInput}`,
    });
    expect(scenario.state.resultDescription).toContain(
      "Tổng chi trong tháng: 5,000,000 VND",
    );
    expect(scenario.state.putTargets).toEqual([
      `/1/cards/${canonicalResultCardId}`,
    ]);
    expect(
      scenario.state.calls
        .filter((call) => call.method !== "GET")
        .every(
          (call) =>
            call.method === "PUT" &&
            call.path === `/1/cards/${canonicalResultCardId}`,
        ),
    ).toBe(true);
    expect(scenario.state.telegramCalls).toHaveLength(0);
    const stageLogs = scenario.state.logs.join("\n");
    expect(stageLogs).toContain('"stage":"trello_read"');
    expect(stageLogs).toContain('"stage":"paid_card_validation"');
    expect(stageLogs).toContain('"stage":"result_card_write"');
    expect(stageLogs).toContain('"requestId":');
    expect(stageLogs).not.toContain("synthetic-telegram-token");
    expect(stageLogs).not.toContain("synthetic-fd-payload");
  });

  it("returns every detected Paid-card issue and sends one sanitized summary", async () => {
    const missingAmount = { ...defaultCardData() };
    delete missingAmount[fieldIds.amount];
    const unknownOption = {
      ...defaultCardData(),
      [fieldIds.paymentMethod]: ["synthetic-unknown-option"],
      [fieldIds.paymentDate]: "2026-08-01T03:00:00.000Z",
    };
    const scenario = createScenario({
      cards: [
        { id: "synthetic-current-invalid", cardData: missingAmount },
        {
          id: "synthetic-old-invalid",
          cardData: unknownOption,
        },
      ],
    });

    const response = await postReconcile(scenario.app);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      status: "error",
      code: "INVALID_PAID_CARD_DATA",
      notification: { status: "sent" },
    });
    expect(body).toMatchObject({
      issues: [
        {
          cardId: "synthetic-current-invalid",
          cardUrl: "https://trello.com/c/P0000001/synthetic-title",
          field: "Số tiền",
          reason: "missing",
        },
        {
          cardId: "synthetic-old-invalid",
          field: "Hình thức thanh toán",
          reason: "invalid_value",
        },
      ],
    });
    expect(scenario.state.telegramCalls).toHaveLength(1);
    expect(scenario.state.telegramCalls[0]).toContain(
      "https://trello.com/c/P0000001",
    );
    expect(scenario.state.telegramCalls[0]).not.toContain("2000000");
    expect(scenario.state.putTargets).toHaveLength(0);
    const logs = scenario.state.logs.join("\n");
    expect(logs).toContain('"issueSummary":');
    expect(logs).toContain("Số tiền:missing=1");
    expect(logs).toContain("Hình thức thanh toán:invalid_value=1");
    expect(logs).not.toContain("synthetic-current-invalid");
    expect(logs).not.toContain("https://trello.com");
    expect(logs).not.toContain("2000000");
  });

  it("collects independent invalid fields from one Paid card", async () => {
    const invalidFields = {
      ...defaultCardData(),
      [fieldIds.amount]: 0,
      [fieldIds.expenseType]: ["synthetic-unknown-expense"],
      [fieldIds.paymentMethod]: ["synthetic-unknown-method"],
    };
    const scenario = createScenario({
      cards: [{ id: "synthetic-multi-invalid", cardData: invalidFields }],
    });

    const response = await postReconcile(scenario.app);
    const body = await response.json();
    if (!isRecord(body) || !Array.isArray(body.issues)) {
      throw new Error("Expected a complete issue list");
    }

    expect(response.status).toBe(422);
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "Số tiền", reason: "invalid_value" }),
        expect.objectContaining({
          field: "Loại chi phí",
          reason: "invalid_value",
        }),
        expect.objectContaining({
          field: "Hình thức thanh toán",
          reason: "invalid_value",
        }),
      ]),
    );
    expect(scenario.state.telegramCalls).toHaveLength(1);
    expect(scenario.state.putTargets).toHaveLength(0);
    expect(scenario.state.logs.join("\n")).toContain(
      '"issueSummary":"',
    );
  });

  it("keeps the complete response issue list when Telegram truncates", async () => {
    const missingAmount = { ...defaultCardData() };
    delete missingAmount[fieldIds.amount];
    const cards = Array.from({ length: 200 }, (_, index) => ({
      id: `synthetic-truncated-card-${index}`,
      cardData: missingAmount,
    }));
    const scenario = createScenario({ cards });

    const response = await postReconcile(scenario.app);
    const body = await response.json();
    if (!isRecord(body) || !Array.isArray(body.issues)) {
      throw new Error("Expected a complete issue list");
    }

    expect(response.status).toBe(422);
    expect(body.issues).toHaveLength(200);
    expect(scenario.state.telegramCalls).toHaveLength(1);
    expect(scenario.state.telegramCalls[0]?.length).toBeLessThanOrEqual(4096);
    expect(scenario.state.telegramCalls[0]).toContain("phiếu chưa liệt kê.");
    expect(scenario.state.putTargets).toHaveLength(0);
  });

  it("keeps every API issue when the single Telegram message is truncated", async () => {
    const missingAmount = { ...defaultCardData() };
    delete missingAmount[fieldIds.amount];
    const cards = Array.from({ length: 200 }, (_, index) => ({
      id: `synthetic-truncated-card-${index}`,
      cardData: missingAmount,
    }));
    const scenario = createScenario({ cards });

    const response = await postReconcile(scenario.app);
    const body = await response.json();
    if (!isRecord(body) || !Array.isArray(body.issues)) {
      throw new Error("Expected a complete issue list");
    }

    expect(response.status).toBe(422);
    expect(body.issues).toHaveLength(200);
    expect(scenario.state.telegramCalls).toHaveLength(1);
    expect(scenario.state.telegramCalls[0]?.length).toBeLessThanOrEqual(4096);
    expect(scenario.state.telegramCalls[0]).toContain("phiếu chưa liệt kê.");
    expect(scenario.state.putTargets).toHaveLength(0);
  });

  it("preserves 422 and reports notification failure without writing", async () => {
    const missingAmount = { ...defaultCardData() };
    delete missingAmount[fieldIds.amount];
    const scenario = createScenario({
      cards: [{ id: "synthetic-invalid-card", cardData: missingAmount }],
      telegramStatus: 503,
    });

    const response = await postReconcile(scenario.app);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      code: "INVALID_PAID_CARD_DATA",
      notification: { status: "failed" },
    });
    expect(scenario.state.putTargets).toHaveLength(0);
    const logs = scenario.state.logs.join("\n");
    expect(logs).toContain('"notificationReason":"retry_exhausted"');
    expect(logs).toContain('"upstreamStatus":503');
    expect(logs).not.toContain("synthetic-invalid-card");
  });

  it("rejects archived Paid cards without writing or notifying Telegram", async () => {
    const scenario = createScenario({
      cards: [
        {
          id: "synthetic-archived-paid",
          closed: true,
          cardData: defaultCardData(),
        },
      ],
    });

    const response = await postReconcile(scenario.app);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      code: "ARCHIVED_PAID_CARD",
      archivedPaidCards: [
        {
          cardId: "synthetic-archived-paid",
          cardUrl: "https://trello.com/c/P0000001/synthetic-title",
        },
      ],
    });
    expect(scenario.state.putTargets).toHaveLength(0);
    expect(scenario.state.telegramCalls).toHaveLength(0);
    expect(scenario.state.logs.join("\n")).toContain('"archivedPaidCount":1');
  });

  it("maps incompatible global CFG to 502, not an empty successful report", async () => {
    const scenario = createScenario({
      config: { ...validConfig, version: 20 },
      cards: [],
    });

    const response = await postReconcile(scenario.app);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      status: "error",
      code: "INVALID_AMAZING_FIELDS_CONFIGURATION",
    });
    expect(scenario.state.putTargets).toHaveLength(0);
  });

  it("detects changed Paid fields before the result-card write", async () => {
    const scenario = createScenario({
      cards: [{ id: "synthetic-changing-card" }],
      mutateCardPluginDataOnSecondRead: "synthetic-changing-card",
    });

    const response = await postReconcile(scenario.app);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: "RECONCILIATION_CONFLICT",
    });
    expect(scenario.state.putTargets).toHaveLength(0);
  });

  it("retries a transient Trello 429 between read and re-read", async () => {
    const scenario = createScenario({
      cards: [{ id: "synthetic-transient-card" }],
      transient429CardId: "synthetic-transient-card",
      maxAttempts: 2,
    });

    const response = await postReconcile(scenario.app);

    expect(response.status).toBe(200);
    expect(scenario.state.cardDataRead429Sent.has("synthetic-transient-card")).toBe(
      true,
    );
    expect(scenario.state.putTargets).toHaveLength(1);
  });

  it("does not write or return 200 when Trello retry is exhausted", async () => {
    const scenario = createScenario({
      cards: [{ id: "synthetic-rate-limited-card" }],
      always429CardId: "synthetic-rate-limited-card",
      maxAttempts: 2,
    });

    const response = await postReconcile(scenario.app);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ code: "TRELLO_UPSTREAM_FAILURE" });
    expect(scenario.state.putTargets).toHaveLength(0);
  });

  it("confirms an ambiguous committed PUT by read-back without retrying", async () => {
    const scenario = createScenario({
      cards: [{ id: "synthetic-ambiguous-card" }],
      putMode: "commit_then_timeout",
    });

    const response = await postReconcile(scenario.app);

    expect(response.status).toBe(200);
    expect(scenario.state.putTargets).toHaveLength(1);
  });

  it("returns an error for an ambiguous uncommitted PUT without blind retry", async () => {
    const scenario = createScenario({
      cards: [{ id: "synthetic-uncommitted-card" }],
      putMode: "fail_before_commit",
    });

    const response = await postReconcile(scenario.app);

    expect(response.status).toBe(503);
    expect(scenario.state.putTargets).toHaveLength(1);
  });

  it.each([0, 50, 150, 500])(
    "processes all %i Paid cards under a fake sliding-window budget",
    async (count) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));
      const acquiredAt: number[] = [];
      const windowLimiter = new SlidingWindowRateLimiter({
        now: () => Date.now(),
      });
      const rateLimiter: RequestRateLimiter = {
        async acquire() {
          await windowLimiter.acquire();
          acquiredAt.push(Date.now());
        },
      };
      const cards = Array.from({ length: count }, (_, index) => ({
        id: `synthetic-load-card-${index}`,
        cardData: defaultCardData(2_000_000, "Tiền mặt"),
      }));
      const scenario = createScenario({ cards, rateLimiter });

      const request = postReconcile(scenario.app);
      await vi.runAllTimersAsync();
      const response = await request;
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        totalSpentVnd: count * 2_000_000,
        cashSpentVnd: count * 2_000_000,
        bankTransferSpentVnd: 0,
      });
      expect(scenario.state.putTargets).toHaveLength(1);
      for (const start of new Set(acquiredAt)) {
        const windowCount = acquiredAt.filter(
          (timestamp) => timestamp >= start && timestamp < start + 10_000,
        ).length;
        expect(windowCount).toBeLessThanOrEqual(80);
      }
    },
  );
});
