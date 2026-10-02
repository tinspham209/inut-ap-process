import {
  validatePaidCards,
  type PaidCardInput,
  type PaidCardIssue,
  type ArchivedPaidCard,
} from "./paid-card.js";

export type ReconciliationFailureCode =
  | "INVALID_PAID_CARD_DATA"
  | "ARCHIVED_PAID_CARD"
  | "TOTAL_OVERFLOW";

export type ReconciliationResult =
  | {
      ok: true;
      month: string;
      asOf: string;
      totalSpentVnd: number;
      cashSpentVnd: number;
      bankTransferSpentVnd: number;
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
): ReconciliationResult {
  const reportMonth = monthInVietnam(asOf);
  const validation = validatePaidCards(cards, paidListId, asOf);

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
  for (const card of validation.validCards) {
    if (monthInVietnam(new Date(card.fields.paidAt)) !== reportMonth) {
      continue;
    }
    const amount = BigInt(card.fields.amountVnd);
    if (card.fields.paymentMethod === "Tiền mặt") {
      cashSpentVnd += amount;
    } else {
      bankTransferSpentVnd += amount;
    }
  }

  const totalSpentVnd = cashSpentVnd + bankTransferSpentVnd;
  if (
    cashSpentVnd > MAX_SAFE_TOTAL ||
    bankTransferSpentVnd > MAX_SAFE_TOTAL ||
    totalSpentVnd > MAX_SAFE_TOTAL
  ) {
    return {
      ok: false,
      code: "TOTAL_OVERFLOW",
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
  };
}
