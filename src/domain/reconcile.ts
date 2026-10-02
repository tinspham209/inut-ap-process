import {
  validatePaidCards,
  type PaidCardInput,
  type PaidCardIssue,
  type ArchivedPaidCard,
} from "./paid-card.js";

export type ReconciliationFailureCode =
  | "INVALID_PAID_CARD_DATA"
  | "ARCHIVED_PAID_CARD"
  | "TOTAL_OVERFLOW"
  | "CATEGORY_TOTAL_MISMATCH";

export type ReconciliationResult =
  | {
      ok: true;
      month: string;
      asOf: string;
      totalSpentVnd: number;
      cashSpentVnd: number;
      bankTransferSpentVnd: number;
      spentByExpenseType: Array<{
        expenseType: string;
        spentVnd: number;
      }>;
    }
  | {
      ok: false;
      code: ReconciliationFailureCode;
      issues: PaidCardIssue[];
      archivedPaidCards: ArchivedPaidCard[];
    };

const REPORTING_TIME_ZONE = "Asia/Ho_Chi_Minh";
const MAX_SAFE_TOTAL = BigInt(Number.MAX_SAFE_INTEGER);

function monthInVietnam(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) {
    throw new Error("Unable to determine the Vietnam reporting month");
  }
  return `${month}/${year}`;
}

export function reconcilePaidCards(
  cards: readonly PaidCardInput[],
  paidListId: string,
  asOf: Date,
  expenseTypeOrder: readonly string[],
): ReconciliationResult {
  const reportMonth = monthInVietnam(asOf);
  const orderedExpenseTypes = [
    ...new Set(expenseTypeOrder.map((expenseType) => expenseType.trim())),
  ];
  const allowedExpenseTypes = new Set(orderedExpenseTypes);
  const validation = validatePaidCards(
    cards,
    paidListId,
    asOf,
    allowedExpenseTypes,
  );

  if (validation.archivedPaidCards.length > 0) {
    return {
      ok: false,
      code: "ARCHIVED_PAID_CARD",
      issues: validation.issues,
      archivedPaidCards: validation.archivedPaidCards,
    };
  }
  if (validation.issues.length > 0) {
    return {
      ok: false,
      code: "INVALID_PAID_CARD_DATA",
      issues: validation.issues,
      archivedPaidCards: [],
    };
  }

  let cashSpentVnd = 0n;
  let bankTransferSpentVnd = 0n;
  const categoryTotals = new Map<string, bigint>();
  for (const card of validation.validCards) {
    if (monthInVietnam(new Date(card.fields.paidAt)) !== reportMonth) {
      continue;
    }
    const amount = BigInt(card.fields.amountVnd);
    const expenseType = card.fields.expenseType.trim();
    categoryTotals.set(
      expenseType,
      (categoryTotals.get(expenseType) ?? 0n) + amount,
    );
    if (card.fields.paymentMethod === "Tiền mặt") {
      cashSpentVnd += amount;
    } else {
      bankTransferSpentVnd += amount;
    }
  }

  const totalSpentVnd = cashSpentVnd + bankTransferSpentVnd;
  const categoryTotalVnd = [...categoryTotals.values()].reduce(
    (sum, amount) => sum + amount,
    0n,
  );
  if (
    cashSpentVnd > MAX_SAFE_TOTAL ||
    bankTransferSpentVnd > MAX_SAFE_TOTAL ||
    totalSpentVnd > MAX_SAFE_TOTAL ||
    categoryTotalVnd > MAX_SAFE_TOTAL
  ) {
    return {
      ok: false,
      code: "TOTAL_OVERFLOW",
      issues: [],
      archivedPaidCards: [],
    };
  }
  if (categoryTotalVnd !== totalSpentVnd) {
    return {
      ok: false,
      code: "CATEGORY_TOTAL_MISMATCH",
      issues: [],
      archivedPaidCards: [],
    };
  }

  return {
    ok: true,
    month: reportMonth,
    asOf: asOf.toISOString(),
    totalSpentVnd: Number(totalSpentVnd),
    cashSpentVnd: Number(cashSpentVnd),
    bankTransferSpentVnd: Number(bankTransferSpentVnd),
    spentByExpenseType: orderedExpenseTypes.flatMap((expenseType) => {
      const spentVnd = categoryTotals.get(expenseType) ?? 0n;
      return spentVnd > 0n
        ? [{ expenseType, spentVnd: Number(spentVnd) }]
        : [];
    }),
  };
}
