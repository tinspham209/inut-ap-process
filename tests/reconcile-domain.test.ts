import { describe, expect, it } from "vitest";
import { reconcilePaidCards } from "../src/domain/reconcile.js";
import type { PaidCardInput } from "../src/domain/paid-card.js";
import type { ParsedPaidFields } from "../src/trello/amazing-fields.js";

const paidListId = "synthetic-paid-list-id";
const asOf = new Date("2026-09-29T12:00:00.000Z");

const baseFields: ParsedPaidFields = {
  amountVnd: 2_000_000,
  expenseType: "Synthetic expense",
  paymentMethod: "Tiền mặt",
  paidAt: "2026-09-02T03:00:00.000Z",
};

function paidCard(
  id: string,
  overrides: Partial<PaidCardInput> = {},
): PaidCardInput {
  return {
    id,
    name: "Synthetic AP card",
    idList: paidListId,
    closed: false,
    url: `https://trello.com/c/${id}`,
    fields: { status: "valid", values: baseFields },
    ...overrides,
  };
}

function success(
  result: ReturnType<typeof reconcilePaidCards>,
): Extract<ReturnType<typeof reconcilePaidCards>, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Expected a successful reconciliation, got ${result.code}`);
  }
  return result;
}

describe("Paid-card reconciliation domain", () => {
  it("sums cash and transfer payments for the Vietnam reporting month", () => {
    const result = success(
      reconcilePaidCards(
        [
          paidCard("synthetic-cash-card"),
          paidCard("synthetic-bank-card", {
            fields: {
              status: "valid",
              values: {
                ...baseFields,
                amountVnd: 3_000_000,
                paymentMethod: "Chuyển khoản",
              },
            },
          }),
        ],
        paidListId,
        asOf,
      ),
    );

    expect(result).toEqual({
      ok: true,
      month: "09/2026",
      asOf: "2026-09-29T12:00:00.000Z",
      totalSpentVnd: 5_000_000,
      cashSpentVnd: 2_000_000,
      bankTransferSpentVnd: 3_000_000,
    });
  });

  it("returns zeros only after a successful run with no current-month Paid cards", () => {
    const result = success(reconcilePaidCards([], paidListId, asOf));

    expect(result).toMatchObject({
      totalSpentVnd: 0,
      cashSpentVnd: 0,
      bankTransferSpentVnd: 0,
    });
  });

  it("ignores non-Paid and archived non-Paid cards", () => {
    const result = success(
      reconcilePaidCards(
        [
          paidCard("synthetic-requesting", {
            idList: "synthetic-requesting-list",
            fields: {
              status: "invalid",
              issues: [{ field: "Số tiền", reason: "missing" }],
            },
          }),
          paidCard("synthetic-approved", {
            idList: "synthetic-approved-list",
          }),
          paidCard("synthetic-discard", {
            idList: "synthetic-discard-list",
            closed: true,
          }),
        ],
        paidListId,
        asOf,
      ),
    );

    expect(result.totalSpentVnd).toBe(0);
  });

  it("counts a duplicate card ID at most once", () => {
    const card = paidCard("synthetic-duplicate-card");
    const result = success(
      reconcilePaidCards([card, card], paidListId, asOf),
    );

    expect(result.totalSpentVnd).toBe(2_000_000);
  });

  it("excludes valid older-month expenses but still validates their fields", () => {
    const olderCard = paidCard("synthetic-old-card", {
      fields: {
        status: "valid",
        values: {
          ...baseFields,
          paidAt: "2026-08-31T16:59:59.000Z",
        },
      },
    });
    const currentMonthStart = new Date("2026-08-31T17:00:00.000Z");
    const result = success(
      reconcilePaidCards([olderCard], paidListId, currentMonthStart),
    );

    expect(result.month).toBe("09/2026");
    expect(result.totalSpentVnd).toBe(0);
  });

  it("uses an inclusive Vietnam-month start boundary", () => {
    const before = paidCard("synthetic-before-boundary", {
      fields: {
        status: "valid",
        values: {
          ...baseFields,
          paidAt: "2026-08-31T16:59:59.999Z",
        },
      },
    });
    const atStart = paidCard("synthetic-at-boundary", {
      fields: {
        status: "valid",
        values: {
          ...baseFields,
          paidAt: "2026-08-31T17:00:00.000Z",
        },
      },
    });

    const result = success(
      reconcilePaidCards(
        [before, atStart],
        paidListId,
        new Date("2026-08-31T17:00:00.000Z"),
      ),
    );

    expect(result.totalSpentVnd).toBe(2_000_000);
  });

  it("fails with all detected field issues, including for older cards", () => {
    const invalidTitle = paidCard("synthetic-invalid-title", {
      name: "  ",
      fields: {
        status: "invalid",
        issues: [
          { field: "Số tiền", reason: "missing" },
          { field: "Loại chi phí", reason: "missing" },
        ],
      },
    });
    const invalidDate = paidCard("synthetic-invalid-date", {
      fields: {
        status: "valid",
        values: {
          ...baseFields,
          paidAt: "not-a-timestamp",
        },
      },
    });

    const result = reconcilePaidCards(
      [invalidTitle, invalidDate],
      paidListId,
      asOf,
    );

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_PAID_CARD_DATA",
      issues: [
        {
          cardId: "synthetic-invalid-title",
          field: "Tiêu đề",
          reason: "missing",
        },
        {
          cardId: "synthetic-invalid-title",
          field: "Số tiền",
          reason: "missing",
        },
        {
          cardId: "synthetic-invalid-title",
          field: "Loại chi phí",
          reason: "missing",
        },
        {
          cardId: "synthetic-invalid-date",
          field: "Ngày thanh toán",
          reason: "invalid_format",
        },
      ],
    });
  });

  it("fails the entire run for archived Paid cards and identifies the card", () => {
    const result = reconcilePaidCards(
      [
        paidCard("synthetic-archived-paid", { closed: true }),
        paidCard("synthetic-active-paid"),
      ],
      paidListId,
      asOf,
    );

    expect(result).toMatchObject({
      ok: false,
      code: "ARCHIVED_PAID_CARD",
      archivedPaidCards: [
        {
          cardId: "synthetic-archived-paid",
          cardUrl: "https://trello.com/c/synthetic-archived-paid",
        },
      ],
    });
  });

  it("rejects future payment dates and invalid VND amounts", () => {
    const future = paidCard("synthetic-future-payment", {
      fields: {
        status: "valid",
        values: { ...baseFields, paidAt: "2026-09-29T12:00:00.001Z" },
      },
    });
    const nonIntegerAmount = paidCard("synthetic-noninteger", {
      fields: {
        status: "valid",
        values: { ...baseFields, amountVnd: 2_000_000.5 },
      },
    });

    const result = reconcilePaidCards([future, nonIntegerAmount], paidListId, asOf);

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_PAID_CARD_DATA",
      issues: [
        {
          cardId: "synthetic-future-payment",
          field: "Ngày thanh toán",
          reason: "invalid_value",
        },
        {
          cardId: "synthetic-noninteger",
          field: "Số tiền",
          reason: "invalid_format",
        },
      ],
    });
  });

  it("still rejects invalid fields on an older-month Paid card", () => {
    const olderInvalidCard = paidCard("synthetic-old-invalid-card", {
      fields: {
        status: "valid",
        values: {
          ...baseFields,
          amountVnd: 0,
          paidAt: "2026-08-01T03:00:00.000Z",
        },
      },
    });

    expect(
      reconcilePaidCards([olderInvalidCard], paidListId, asOf),
    ).toMatchObject({
      ok: false,
      code: "INVALID_PAID_CARD_DATA",
      issues: [
        {
          cardId: "synthetic-old-invalid-card",
          field: "Số tiền",
          reason: "invalid_value",
        },
      ],
    });
  });

  it("rejects unsafe aggregate totals instead of rounding VND", () => {
    const result = reconcilePaidCards(
      [
        paidCard("synthetic-max-safe", {
          fields: {
            status: "valid",
            values: { ...baseFields, amountVnd: Number.MAX_SAFE_INTEGER },
          },
        }),
        paidCard("synthetic-overflow", {
          fields: {
            status: "valid",
            values: { ...baseFields, amountVnd: 1 },
          },
        }),
      ],
      paidListId,
      asOf,
    );

    expect(result).toMatchObject({
      ok: false,
      code: "TOTAL_OVERFLOW",
    });
  });
});
