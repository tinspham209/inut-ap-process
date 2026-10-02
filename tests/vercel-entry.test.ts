import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const syntheticEnvironment = {
  TRELLO_API_KEY: "synthetic-api-key",
  TRELLO_API_TOKEN: "synthetic-api-token",
  TRELLO_BOARD_ID: "synthetic-board-id",
  TRELLO_PAID_LIST_ID: "synthetic-paid-list-id",
  TRELLO_RESULT_CARD_ID: "synthetic-result-card-id",
  AMAZING_FIELDS_PLUGIN_ID: "synthetic-plugin-id",
  RECONCILE_CRON_SECRET: "synthetic-cron-secret",
  RECONCILE_BUTTON_SECRET: "synthetic-button-secret",
  TELEGRAM_BOT_TOKEN: "synthetic-bot-token",
  TELEGRAM_CHAT_ID: "synthetic-chat-id",
  PORT: "43130",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Vercel Hono entry point", () => {
  it("default-exports the configured Hono app without starting a Node listener", async () => {
    for (const [name, value] of Object.entries(syntheticEnvironment)) {
      vi.stubEnv(name, value);
    }

    const entry = await import("../src/index.js");

    expect(entry.default).toBeInstanceOf(Hono);
    const health = await entry.default.request("/health");
    expect(health.status).toBe(200);

    const unauthorizedDiagnostics =
      await entry.default.request("/v1/config-check");
    expect(unauthorizedDiagnostics.status).toBe(401);
  });
});
