import { describe, expect, it } from "vitest";
import {
  AmazingFieldsCardDataError,
  AmazingFieldsConfigError,
  parseAmazingFieldsCard,
  parseAmazingFieldsConfig,
} from "../src/trello/amazing-fields.js";
import {
  fieldIds,
  makeAmazingFieldsFixture,
  syntheticBoardId,
  syntheticPluginId,
  validCardData,
  validConfig,
  validFields,
} from "./fixtures/amazing-fields.js";

describe("Amazing Fields parser", () => {
  it("maps the four required fields and option IDs into typed values", () => {
    const fixture = makeAmazingFieldsFixture();
    const config = parseAmazingFieldsConfig(
      fixture.boardPluginData,
      syntheticPluginId,
      syntheticBoardId,
    );

    expect(
      parseAmazingFieldsCard(
        fixture.cardPluginData,
        syntheticPluginId,
        config,
      ),
    ).toEqual({
      amountVnd: 2_000_000,
      expenseType: "Synthetic expense",
      paymentMethod: "Tiền mặt",
      paidAt: "2026-09-29T04:30:00.000Z",
    });
  });

  it("maps the transfer option by ID", () => {
    const card = {
      ...validCardData,
      [fieldIds.paymentMethod]: [fieldIds.transferOption],
    };
    const fixture = makeAmazingFieldsFixture({ card });
    const config = parseAmazingFieldsConfig(
      fixture.boardPluginData,
      syntheticPluginId,
      syntheticBoardId,
    );

    expect(
      parseAmazingFieldsCard(
        fixture.cardPluginData,
        syntheticPluginId,
        config,
      ).paymentMethod,
    ).toBe("Chuyển khoản");
  });

  it("rejects malformed and incompatible board configuration", () => {
    const fixture = makeAmazingFieldsFixture({
      config: { ...validConfig, version: 0 },
    });

    expect(() =>
      parseAmazingFieldsConfig(
        fixture.boardPluginData,
        syntheticPluginId,
        syntheticBoardId,
      ),
    ).toThrow(AmazingFieldsConfigError);

    const wrongBoard = makeAmazingFieldsFixture({
      config: { ...validConfig, boardId: "another-board-id" },
    });
    expect(() =>
      parseAmazingFieldsConfig(
        wrongBoard.boardPluginData,
        syntheticPluginId,
        syntheticBoardId,
      ),
    ).toThrow(AmazingFieldsConfigError);
  });

  it("fails closed on an unrecognized configuration version", () => {
    const fixture = makeAmazingFieldsFixture({
      config: { ...validConfig, version: 20 },
    });

    expect(() =>
      parseAmazingFieldsConfig(
        fixture.boardPluginData,
        syntheticPluginId,
        syntheticBoardId,
      ),
    ).toThrow(AmazingFieldsConfigError);
  });

  it("requires every current field with its expected type and valid options", () => {
    const config = {
      ...validConfig,
      fields: validFields.filter((field) => field.id !== fieldIds.amount),
    };
    const fixture = makeAmazingFieldsFixture({ config });

    expect(() =>
      parseAmazingFieldsConfig(
        fixture.boardPluginData,
        syntheticPluginId,
        syntheticBoardId,
      ),
    ).toThrow(AmazingFieldsConfigError);
  });

  it("rejects a card with an unknown option ID as a field issue", async () => {
    const card = {
      ...validCardData,
      [fieldIds.paymentMethod]: ["unknown-option-id"],
    };
    const fixture = makeAmazingFieldsFixture({ card });
    const config = parseAmazingFieldsConfig(
      fixture.boardPluginData,
      syntheticPluginId,
      syntheticBoardId,
    );

    await expect(
      Promise.resolve().then(() =>
        parseAmazingFieldsCard(
          fixture.cardPluginData,
          syntheticPluginId,
          config,
        ),
      ),
    ).rejects.toMatchObject({
      field: "Hình thức thanh toán",
      reason: "invalid_value",
    });
  });

  it("rejects date values without an explicit timezone", async () => {
    const card = {
      ...validCardData,
      [fieldIds.paymentDate]: "2026-09-29T04:30:00",
    };
    const fixture = makeAmazingFieldsFixture({ card });
    const config = parseAmazingFieldsConfig(
      fixture.boardPluginData,
      syntheticPluginId,
      syntheticBoardId,
    );

    await expect(
      Promise.resolve().then(() =>
        parseAmazingFieldsCard(
          fixture.cardPluginData,
          syntheticPluginId,
          config,
        ),
      ),
    ).rejects.toBeInstanceOf(AmazingFieldsCardDataError);
  });

  it("rejects impossible calendar dates without exposing the stored value", async () => {
    const card = {
      ...validCardData,
      [fieldIds.paymentDate]: "2026-02-30T04:30:00.000Z",
    };
    const fixture = makeAmazingFieldsFixture({ card });
    const config = parseAmazingFieldsConfig(
      fixture.boardPluginData,
      syntheticPluginId,
      syntheticBoardId,
    );

    await expect(
      Promise.resolve().then(() =>
        parseAmazingFieldsCard(
          fixture.cardPluginData,
          syntheticPluginId,
          config,
        ),
      ),
    ).rejects.toMatchObject({
      field: "Ngày thanh toán",
      reason: "invalid_format",
    });
  });

  it("reports a missing card field with its field name and reason", async () => {
    const card = { ...validCardData };
    delete card[fieldIds.amount];
    const fixture = makeAmazingFieldsFixture({ card });
    const config = parseAmazingFieldsConfig(
      fixture.boardPluginData,
      syntheticPluginId,
      syntheticBoardId,
    );

    await expect(
      Promise.resolve().then(() =>
        parseAmazingFieldsCard(
          fixture.cardPluginData,
          syntheticPluginId,
          config,
        ),
      ),
    ).rejects.toMatchObject({
      field: "Số tiền",
      reason: "missing",
    });
  });
});
