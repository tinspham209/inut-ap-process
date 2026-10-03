import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createServerLogger } from "../src/logger.js";

const requiredEnv = {
  TRELLO_API_KEY: "test-api-key",
  TRELLO_API_TOKEN: "test-api-token",
  TRELLO_BOARD_ID: "test-board-id",
  TRELLO_PAID_LIST_ID: "test-paid-list-id",
  TRELLO_RESULT_CARD_ID: "test-result-card-id",
  AMAZING_FIELDS_PLUGIN_ID: "test-plugin-id",
  RECONCILE_CRON_SECRET: "test-cron-secret",
  RECONCILE_BUTTON_SECRET: "test-button-secret",
  RECONCILE_PAID_TRIGGER_SECRET: "test-paid-trigger-secret",
  TELEGRAM_BOT_TOKEN: "test-bot-token",
  TELEGRAM_CHAT_ID: "test-chat-id",
};

describe("application smoke checks", () => {
  it("serves health without external requests or configuration details", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const app = createApp({
      config: {
        reconcileCronSecret: "synthetic-cron-secret",
        reconcileButtonSecret: "synthetic-button-secret",
        reconcilePaidTriggerSecret: "synthetic-paid-trigger-secret",
      },
      executeReconciliation: async () => {
        throw new Error("Health must not execute reconciliation");
      },
      logger: createServerLogger(() => {}),
    });

    try {
      const response = await app.request("/health");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("fails fast with missing required environment variable names only", () => {
    expect(() => loadConfig({})).toThrow(
      "Missing required environment variables:",
    );
    expect(() => loadConfig({})).toThrow("TRELLO_API_KEY");
    expect(() => loadConfig({})).not.toThrow("test-api-key");
  });

  it("requires the paid-trigger secret", () => {
    expect(() =>
      loadConfig({
        ...requiredEnv,
        RECONCILE_PAID_TRIGGER_SECRET: " ",
      }),
    ).toThrow("RECONCILE_PAID_TRIGGER_SECRET");
  });

  it.each([
    {
      name: "cron and button",
      env: {
        ...requiredEnv,
        RECONCILE_BUTTON_SECRET: requiredEnv.RECONCILE_CRON_SECRET,
      },
    },
    {
      name: "cron and paid-trigger",
      env: {
        ...requiredEnv,
        RECONCILE_PAID_TRIGGER_SECRET: requiredEnv.RECONCILE_CRON_SECRET,
      },
    },
    {
      name: "button and paid-trigger",
      env: {
        ...requiredEnv,
        RECONCILE_PAID_TRIGGER_SECRET: requiredEnv.RECONCILE_BUTTON_SECRET,
      },
    },
  ])("rejects identical $name secrets", ({ env }) => {
    expect(() => loadConfig(env)).toThrow("must be different");
  });

  it("rejects empty IDs and invalid ports", () => {
    expect(() =>
      loadConfig({ ...requiredEnv, TRELLO_BOARD_ID: "   " }),
    ).toThrow("TRELLO_BOARD_ID");
    expect(() => loadConfig({ ...requiredEnv, PORT: "70000" })).toThrow(
      "PORT",
    );
  });

  it("loads sanitized configuration and defaults to port 3000", () => {
    expect(loadConfig(requiredEnv)).toMatchObject({
      trelloBoardId: "test-board-id",
      trelloPaidListId: "test-paid-list-id",
      trelloResultCardId: "test-result-card-id",
      reconcilePaidTriggerSecret: "test-paid-trigger-secret",
      port: 3000,
    });
  });
});
