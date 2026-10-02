import type {
  AmazingFieldIssueReason,
  ParsedPaidFields,
} from "../trello/amazing-fields.js";

export type PaidCardFieldData =
  | { status: "valid"; values: ParsedPaidFields }
  | {
      status: "invalid";
      issues: ReadonlyArray<{
        field: string;
        reason: AmazingFieldIssueReason;
      }>;
    };

export interface PaidCardInput {
  id: string;
  name: string;
  idList: string;
  closed: boolean;
  url: string;
  fields: PaidCardFieldData;
}

export interface PaidCardIssue {
  cardId: string;
  cardUrl: string;
  field: string;
  reason: AmazingFieldIssueReason;
}

export interface ArchivedPaidCard {
  cardId: string;
  cardUrl: string;
}

export interface ValidatedPaidCard {
  cardId: string;
  fields: ParsedPaidFields;
}

export interface PaidCardValidation {
  validCards: ValidatedPaidCard[];
  issues: PaidCardIssue[];
  archivedPaidCards: ArchivedPaidCard[];
}

function isAbsoluteTimestamp(value: string): boolean {
  const timestampPattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
  return timestampPattern.test(value) && Number.isFinite(Date.parse(value));
}

export function validatePaidCards(
  cards: readonly PaidCardInput[],
  paidListId: string,
  asOf: Date,
): PaidCardValidation {
  if (!Number.isFinite(asOf.getTime())) {
    throw new Error("Reconciliation asOf must be a valid date");
  }

  const validCards: ValidatedPaidCard[] = [];
  const issues: PaidCardIssue[] = [];
  const archivedPaidCards: ArchivedPaidCard[] = [];
  const seenCardIds = new Set<string>();

  for (const card of cards) {
    if (card.idList !== paidListId || seenCardIds.has(card.id)) {
      continue;
    }
    seenCardIds.add(card.id);

    if (card.closed) {
      archivedPaidCards.push({ cardId: card.id, cardUrl: card.url });
    }

    const cardIssues: PaidCardIssue[] = [];
    if (!card.name.trim()) {
      cardIssues.push({
        cardId: card.id,
        cardUrl: card.url,
        field: "Tiêu đề",
        reason: "missing",
      });
    }

    if (card.fields.status === "invalid") {
      for (const fieldIssue of card.fields.issues) {
        cardIssues.push({
          cardId: card.id,
          cardUrl: card.url,
          field: fieldIssue.field,
          reason: fieldIssue.reason,
        });
      }
    } else {
      const fields = card.fields.values;
      if (!Number.isSafeInteger(fields.amountVnd)) {
        cardIssues.push({
          cardId: card.id,
          cardUrl: card.url,
          field: "Số tiền",
          reason: "invalid_format",
        });
      } else if (fields.amountVnd <= 0) {
        cardIssues.push({
          cardId: card.id,
          cardUrl: card.url,
          field: "Số tiền",
          reason: "invalid_value",
        });
      }

      if (
        typeof fields.expenseType !== "string" ||
        fields.expenseType.trim().length === 0
      ) {
        cardIssues.push({
          cardId: card.id,
          cardUrl: card.url,
          field: "Loại chi phí",
          reason: "missing",
        });
      }

      if (
        fields.paymentMethod !== "Tiền mặt" &&
        fields.paymentMethod !== "Chuyển khoản"
      ) {
        cardIssues.push({
          cardId: card.id,
          cardUrl: card.url,
          field: "Hình thức thanh toán",
          reason: "invalid_value",
        });
      }

      if (
        typeof fields.paidAt !== "string" ||
        !isAbsoluteTimestamp(fields.paidAt)
      ) {
        cardIssues.push({
          cardId: card.id,
          cardUrl: card.url,
          field: "Ngày thanh toán",
          reason: "invalid_format",
        });
      } else if (Date.parse(fields.paidAt) > asOf.getTime()) {
        cardIssues.push({
          cardId: card.id,
          cardUrl: card.url,
          field: "Ngày thanh toán",
          reason: "invalid_value",
        });
      }

      if (cardIssues.length === 0 && !card.closed) {
        validCards.push({ cardId: card.id, fields });
      }
    }
    issues.push(...cardIssues);
  }

  return { validCards, issues, archivedPaidCards };
}
