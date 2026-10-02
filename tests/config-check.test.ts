import { describe, expect, it, vi } from "vitest";
import { checkRuntimeConfiguration } from "../src/config-check.js";
import {
  makeAmazingFieldsFixture,
  syntheticBoardId,
  syntheticPluginId,
  validConfig,
} from "./fixtures/amazing-fields.js";

const targets = {
  boardId: syntheticBoardId,
  paidListId: "synthetic-paid-list-id",
  resultCardId: "synthetic-result-card-id",
};

describe("read-only runtime configuration check", () => {
  it("checks Trello target access and Amazing Fields CFG without writes", async () => {
    const fixture = makeAmazingFieldsFixture();
    const client = {
      verifyConfiguredTargets: vi.fn(async () => targets),
      getBoardPluginData: vi.fn(async () => fixture.boardPluginData),
    };

    const result = await checkRuntimeConfiguration({
      client,
      pluginId: syntheticPluginId,
      telegramConfigured: true,
    });

    expect(result).toEqual({
      ready: true,
      checks: [
        { name: "environment", status: "passed" },
        {
          name: "telegram_configuration",
          status: "configured_not_tested",
        },
        { name: "trello_access_and_targets", status: "passed" },
        { name: "amazing_fields_board_config", status: "passed" },
      ],
    });
    expect(client.verifyConfiguredTargets).toHaveBeenCalledTimes(1);
    expect(client.getBoardPluginData).toHaveBeenCalledWith(syntheticBoardId);
  });

  it("fails safely when Trello authentication or target validation fails", async () => {
    const client = {
      verifyConfiguredTargets: vi.fn(async () => {
        throw new Error("synthetic credential or board details");
      }),
      getBoardPluginData: vi.fn(),
    };

    const result = await checkRuntimeConfiguration({
      client,
      pluginId: syntheticPluginId,
      telegramConfigured: true,
    });

    expect(result).toMatchObject({
      ready: false,
      checks: [
        { name: "environment", status: "passed" },
        { name: "telegram_configuration", status: "configured_not_tested" },
        {
          name: "trello_access_and_targets",
          status: "failed",
          code: "TRELLO_CHECK_FAILED",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("synthetic credential");
    expect(client.getBoardPluginData).not.toHaveBeenCalled();
  });

  it("reports invalid Amazing Fields configuration without exposing payload", async () => {
    const fixture = makeAmazingFieldsFixture({
      config: { ...validConfig, version: 20 },
    });
    const client = {
      verifyConfiguredTargets: vi.fn(async () => targets),
      getBoardPluginData: vi.fn(async () => fixture.boardPluginData),
    };

    const result = await checkRuntimeConfiguration({
      client,
      pluginId: syntheticPluginId,
      telegramConfigured: true,
    });

    expect(result).toMatchObject({
      ready: false,
      checks: [
        { name: "environment", status: "passed" },
        { name: "telegram_configuration", status: "configured_not_tested" },
        { name: "trello_access_and_targets", status: "passed" },
        {
          name: "amazing_fields_board_config",
          status: "failed",
          code: "AMAZING_FIELDS_CONFIGURATION_INVALID",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-hash");
  });

  it("flags missing Telegram configuration without attempting a send", async () => {
    const fixture = makeAmazingFieldsFixture();
    const client = {
      verifyConfiguredTargets: vi.fn(async () => targets),
      getBoardPluginData: vi.fn(async () => fixture.boardPluginData),
    };

    const result = await checkRuntimeConfiguration({
      client,
      pluginId: syntheticPluginId,
      telegramConfigured: false,
    });

    expect(result.ready).toBe(false);
    expect(result.checks).toContainEqual({
      name: "telegram_configuration",
      status: "failed",
      code: "TELEGRAM_CONFIGURATION_MISSING",
    });
    expect(client.verifyConfiguredTargets).toHaveBeenCalledTimes(1);
  });
});
