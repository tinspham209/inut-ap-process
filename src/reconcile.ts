import { createHash } from "node:crypto";
import type { ReconciliationExecution } from "./app.js";
import {
  AmazingFieldsConfigError,
  inspectAmazingFieldsCard,
  parseAmazingFieldsConfig,
} from "./trello/amazing-fields.js";
import { reconcilePaidCards } from "./domain/reconcile.js";
import type {
  PaidCardInput,
  PaidCardIssue,
} from "./domain/paid-card.js";
import {
  renderResultDescription,
  ResultCardDescriptionLimitError,
  type ResultCardReport,
} from "./result-card.js";
import {
  notifyPaidDataIssues,
  type TelegramNotifierOptions,
} from "./telegram/notifier.js";
import {
  serverLogger,
  type ServerLogger,
} from "./logger.js";
import {
  TrelloApiError,
  type TrelloCard,
  type TrelloPluginData,
  type VerifiedTrelloTargets,
} from "./trello/client.js";

export interface ResultCardServiceClient {
  verifyConfiguredTargets(): Promise<VerifiedTrelloTargets>;
  getCard(cardId: string): Promise<TrelloCard>;
  getBoardPluginData(boardId: string): Promise<TrelloPluginData[]>;
  getBoardCards(boardId: string): Promise<TrelloCard[]>;
  getCardPluginData(cardId: string): Promise<TrelloPluginData[]>;
  updateResultCardDescription(description: string): Promise<TrelloCard>;
}

export interface ReconciliationSnapshot {
  targets: VerifiedTrelloTargets;
  resultCardDescription: string;
  resultCardUrl: string;
  sourceFingerprint: string;
}

export class ReconciliationConflictError extends Error {
  constructor() {
    super("Trello source or result card changed during reconciliation");
    this.name = "ReconciliationConflictError";
  }
}

interface LoadedPaidCard {
  card: TrelloCard;
  pluginData: TrelloPluginData[];
}

interface LoadedReconciliationSnapshot extends ReconciliationSnapshot {
  boardPluginData: TrelloPluginData[];
  paidCards: LoadedPaidCard[];
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprintPluginData(
  records: TrelloPluginData[],
  pluginId: string,
): string {
  const values = records
    .filter((record) => record.idPlugin === pluginId)
    .map((record) =>
      typeof record.value === "string" ? digest(record.value) : "invalid-value",
    )
    .sort();
  return digest(JSON.stringify(values));
}

function sameTargets(
  first: VerifiedTrelloTargets,
  second: VerifiedTrelloTargets,
): boolean {
  return (
    first.boardId === second.boardId &&
    first.paidListId === second.paidListId &&
    first.resultCardId === second.resultCardId
  );
}

function resultCardUrl(card: TrelloCard): string {
  if (card.url) {
    return card.url;
  }
  if (card.shortLink) {
    return `https://trello.com/c/${card.shortLink}`;
  }
  throw new ReconciliationConflictError();
}

async function loadReconciliationSnapshot(
  client: ResultCardServiceClient,
  pluginId: string,
): Promise<LoadedReconciliationSnapshot> {
  const targets = await client.verifyConfiguredTargets();
  const resultCard = await client.getCard(targets.resultCardId);
  if (
    resultCard.id !== targets.resultCardId ||
    resultCard.idBoard !== targets.boardId ||
    resultCard.idList === targets.paidListId ||
    resultCard.closed
  ) {
    throw new ReconciliationConflictError();
  }

  const [boardPluginData, boardCards] = await Promise.all([
    client.getBoardPluginData(targets.boardId),
    client.getBoardCards(targets.boardId),
  ]);
  if (boardCards.some((card) => card.idBoard !== targets.boardId)) {
    throw new ReconciliationConflictError();
  }

  const paidCardMetadata = boardCards
    .filter((card) => card.idList === targets.paidListId)
    .sort((first, second) => first.id.localeCompare(second.id));
  const paidCards = await Promise.all(
    paidCardMetadata.map(async (card) => {
      const pluginData = await client.getCardPluginData(card.id);
      return { card, pluginData };
    }),
  );
  const cardSnapshot = paidCards.map(({ card, pluginData }) => ({
        id: card.id,
        idList: card.idList,
        closed: card.closed,
        nameDigest: digest(card.name),
        pluginDataDigest: fingerprintPluginData(pluginData, pluginId),
      }));
  const sourceFingerprint = digest(
    JSON.stringify({
      boardPluginDataDigest: fingerprintPluginData(boardPluginData, pluginId),
      paidCards: cardSnapshot,
    }),
  );

  return {
    targets,
    resultCardDescription: resultCard.description ?? "",
    resultCardUrl: resultCardUrl(resultCard),
    sourceFingerprint,
    boardPluginData,
    paidCards,
  };
}

export async function captureReconciliationSnapshot(
  client: ResultCardServiceClient,
  pluginId: string,
): Promise<ReconciliationSnapshot> {
  const loaded = await loadReconciliationSnapshot(client, pluginId);
  return {
    targets: loaded.targets,
    resultCardDescription: loaded.resultCardDescription,
    resultCardUrl: loaded.resultCardUrl,
    sourceFingerprint: loaded.sourceFingerprint,
  };
}

function snapshotsMatch(
  first: ReconciliationSnapshot,
  second: ReconciliationSnapshot,
): boolean {
  return (
    sameTargets(first.targets, second.targets) &&
    first.resultCardDescription === second.resultCardDescription &&
    first.sourceFingerprint === second.sourceFingerprint
  );
}

export async function updateResultCardSafely(
  client: ResultCardServiceClient,
  pluginId: string,
  initialSnapshot: ReconciliationSnapshot,
  report: ResultCardReport,
): Promise<{ updatedCardUrl: string }> {
  const description = renderResultDescription(
    initialSnapshot.resultCardDescription,
    report,
  );
  const currentSnapshot = await captureReconciliationSnapshot(client, pluginId);
  if (!snapshotsMatch(initialSnapshot, currentSnapshot)) {
    throw new ReconciliationConflictError();
  }

  try {
    const updatedCard = await client.updateResultCardDescription(description);
    return {
      updatedCardUrl:
        updatedCard.url ??
        (updatedCard.shortLink
          ? `https://trello.com/c/${updatedCard.shortLink}`
          : currentSnapshot.resultCardUrl),
    };
  } catch (error) {
    if (!(error instanceof TrelloApiError) || !error.outcomeUnknown) {
      throw error;
    }

    const afterWriteSnapshot = await captureReconciliationSnapshot(
      client,
      pluginId,
    );
    if (
      afterWriteSnapshot.resultCardDescription === description &&
      afterWriteSnapshot.sourceFingerprint === initialSnapshot.sourceFingerprint &&
      sameTargets(afterWriteSnapshot.targets, initialSnapshot.targets)
    ) {
      return { updatedCardUrl: afterWriteSnapshot.resultCardUrl };
    }
    if (!snapshotsMatch(initialSnapshot, afterWriteSnapshot)) {
      throw new ReconciliationConflictError();
    }
    throw error;
  }
}

export interface ReconciliationServiceOptions {
  client: ResultCardServiceClient;
  pluginId: string;
  telegram: TelegramNotifierOptions;
  requestId?: string;
  logger?: ServerLogger;
  now?: () => Date;
}

function upstreamFailure(error: TrelloApiError): ReconciliationExecution {
  return {
    ok: false,
    status: error.status === 429 || error.status >= 500 ? 503 : 502,
    body: { status: "error", code: "TRELLO_UPSTREAM_FAILURE" },
    logContext: { upstreamStatus: error.status },
  };
}

function paidCardUrl(card: TrelloCard): string {
  if (card.url) {
    return card.url;
  }
  if (card.shortLink) {
    return `https://trello.com/c/${card.shortLink}`;
  }
  throw new TrelloApiError(502, "Paid card is missing a Trello URL");
}

function apiFailure(
  status: 422 | 502 | 503,
  code: string,
  details: Record<string, unknown> = {},
): ReconciliationExecution {
  return {
    ok: false,
    status,
    body: { status: "error", code, ...details },
  };
}

const loggableIssueFields = new Set([
  "Tiêu đề",
  "Số tiền",
  "Loại chi phí",
  "Hình thức thanh toán",
  "Ngày thanh toán",
  "Amazing Fields",
]);

function summarizeIssuesForLog(issues: readonly PaidCardIssue[]): string {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    if (!loggableIssueFields.has(issue.field)) {
      continue;
    }
    const key = `${issue.field}:${issue.reason}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, count]) => `${key}=${count}`)
    .join(";");
}

function safeErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : "Error";
  return [
    "AbortError",
    "Error",
    "RangeError",
    "ReconciliationConflictError",
    "SyntaxError",
    "TrelloApiError",
    "TypeError",
  ].includes(name)
    ? name
    : "Error";
}

export async function executeReconciliation(
  options: ReconciliationServiceOptions,
): Promise<ReconciliationExecution> {
  const logger = options.logger ?? serverLogger;
  const requestId = options.requestId;
  const stageStarted = (
    stage:
      | "trello_read"
      | "amazing_fields_config"
      | "paid_card_validation"
      | "telegram_notification"
      | "result_card_write",
  ): number => {
    logger.info("reconciliation.stage.started", {
      ...(requestId ? { requestId } : {}),
      stage,
    });
    return performance.now();
  };
  const stageCompleted = (
    stage:
      | "trello_read"
      | "amazing_fields_config"
      | "paid_card_validation"
      | "telegram_notification"
      | "result_card_write",
    startedAt: number,
    status: "passed" | "failed" | "not_tested",
    details: {
      code?: string;
      issueCount?: number;
      paidCardCount?: number;
      notificationStatus?: string;
      notificationReason?: string;
      notificationAttempts?: number;
      upstreamStatus?: number;
      errorName?: string;
      issueSummary?: string;
      archivedPaidCount?: number;
    } = {},
  ): void => {
    const level =
      status === "failed"
        ? "error"
        : status === "not_tested"
          ? "warn"
          : "info";
    logger[level]("reconciliation.stage.completed", {
      ...(requestId ? { requestId } : {}),
      stage,
      status,
      durationMs: Math.max(
        0,
        Math.round(performance.now() - startedAt),
      ),
      ...details,
    });
  };

  const asOf = (options.now ?? (() => new Date()))();
  const trelloReadStartedAt = stageStarted("trello_read");
  let loaded: LoadedReconciliationSnapshot;
  try {
    loaded = await loadReconciliationSnapshot(options.client, options.pluginId);
  } catch (error) {
    stageCompleted(
      "trello_read",
      trelloReadStartedAt,
      "failed",
      error instanceof TrelloApiError
        ? {
            code: "TRELLO_UPSTREAM_FAILURE",
            upstreamStatus: error.status,
          }
      : {
          code: "RECONCILIATION_FAILED",
          errorName: safeErrorName(error),
        },
    );
    if (error instanceof TrelloApiError) {
      return upstreamFailure(error);
    }
    throw error;
  }
  stageCompleted("trello_read", trelloReadStartedAt, "passed", {
    paidCardCount: loaded.paidCards.length,
  });

  const configStartedAt = stageStarted("amazing_fields_config");
  let fieldsConfig;
  try {
    fieldsConfig = parseAmazingFieldsConfig(
      loaded.boardPluginData,
      options.pluginId,
      loaded.targets.boardId,
    );
  } catch (error) {
    if (error instanceof AmazingFieldsConfigError) {
      stageCompleted(
        "amazing_fields_config",
        configStartedAt,
        "failed",
        { code: "INVALID_AMAZING_FIELDS_CONFIGURATION" },
      );
      return apiFailure(502, "INVALID_AMAZING_FIELDS_CONFIGURATION");
    }
    stageCompleted(
      "amazing_fields_config",
      configStartedAt,
      "failed",
      {
        code: "CONFIGURATION_CHECK_FAILED",
        errorName: safeErrorName(error),
      },
    );
    throw error;
  }
  stageCompleted("amazing_fields_config", configStartedAt, "passed");

  const validationStartedAt = stageStarted("paid_card_validation");
  const paidCards: PaidCardInput[] = [];
  try {
    for (const { card, pluginData } of loaded.paidCards) {
      const inspection = inspectAmazingFieldsCard(
        pluginData,
        options.pluginId,
        fieldsConfig,
      );
      const fields: PaidCardInput["fields"] =
        inspection.status === "valid"
          ? { status: "valid", values: inspection.values }
          : { status: "invalid", issues: inspection.issues };
      paidCards.push({
        id: card.id,
        name: card.name,
        idList: card.idList,
        closed: card.closed,
        url: paidCardUrl(card),
        fields,
      });
    }
  } catch (error) {
    if (error instanceof TrelloApiError) {
      stageCompleted(
        "paid_card_validation",
        validationStartedAt,
        "failed",
        {
          code: "TRELLO_UPSTREAM_FAILURE",
          upstreamStatus: error.status,
          paidCardCount: paidCards.length,
        },
      );
      return upstreamFailure(error);
    }
    stageCompleted(
      "paid_card_validation",
      validationStartedAt,
      "failed",
      {
        code: "RECONCILIATION_FAILED",
        paidCardCount: paidCards.length,
        errorName: safeErrorName(error),
      },
    );
    throw error;
  }

  const result = reconcilePaidCards(
    paidCards,
    loaded.targets.paidListId,
    asOf,
  );
  stageCompleted(
    "paid_card_validation",
    validationStartedAt,
    result.ok ? "passed" : "failed",
    {
      code: result.ok ? "RECONCILIATION_SUCCEEDED" : result.code,
      issueCount: result.ok ? 0 : result.issues.length,
      paidCardCount: paidCards.length,
      ...(!result.ok && result.code === "INVALID_PAID_CARD_DATA"
        ? { issueSummary: summarizeIssuesForLog(result.issues) }
        : {}),
      ...(!result.ok && result.code === "ARCHIVED_PAID_CARD"
        ? { archivedPaidCount: result.archivedPaidCards.length }
        : {}),
    },
  );
  if (!result.ok) {
    if (result.code === "INVALID_PAID_CARD_DATA") {
      const notificationStartedAt = stageStarted("telegram_notification");
      let notification;
      try {
        notification = await notifyPaidDataIssues(
          options.telegram,
          result.issues,
          asOf,
        );
      } catch (error) {
        stageCompleted(
          "telegram_notification",
          notificationStartedAt,
          "failed",
          {
            code: "TELEGRAM_NOTIFICATION_FAILED",
            errorName: safeErrorName(error),
          },
        );
        throw new Error("Telegram notification failed");
      }
      stageCompleted(
        "telegram_notification",
        notificationStartedAt,
        notification.status === "sent" ? "passed" : "failed",
        {
          code:
            notification.status === "sent"
              ? "PAID_DATA_NOTIFICATION_SENT"
              : "TELEGRAM_NOTIFICATION_FAILED",
          notificationStatus: notification.status,
          ...(notification.reason
            ? { notificationReason: notification.reason }
            : {}),
          notificationAttempts: notification.attempts,
          ...(notification.upstreamStatus
            ? { upstreamStatus: notification.upstreamStatus }
            : {}),
          issueCount: result.issues.length,
        },
      );
      return apiFailure(422, result.code, {
        issues: result.issues,
        notification: {
          status: notification.status,
          omittedCardCount: notification.omittedCardCount,
        },
      });
    }
    if (result.code === "ARCHIVED_PAID_CARD") {
      return apiFailure(422, result.code, {
        archivedPaidCards: result.archivedPaidCards,
        issues: result.issues,
      });
    }
    return apiFailure(422, result.code);
  }

  const resultWriteStartedAt = stageStarted("result_card_write");
  try {
    const { updatedCardUrl } = await updateResultCardSafely(
      options.client,
      options.pluginId,
      {
        targets: loaded.targets,
        resultCardDescription: loaded.resultCardDescription,
        resultCardUrl: loaded.resultCardUrl,
        sourceFingerprint: loaded.sourceFingerprint,
      },
      result,
    );
    stageCompleted("result_card_write", resultWriteStartedAt, "passed");
    return {
      ok: true,
      body: {
        status: "success",
        month: result.month,
        asOf: result.asOf,
        totalSpentVnd: result.totalSpentVnd,
        cashSpentVnd: result.cashSpentVnd,
        bankTransferSpentVnd: result.bankTransferSpentVnd,
        updatedCardUrl,
      },
    };
  } catch (error) {
    if (error instanceof ResultCardDescriptionLimitError) {
      stageCompleted(
        "result_card_write",
        resultWriteStartedAt,
        "failed",
        { code: "RESULT_DESCRIPTION_TOO_LONG" },
      );
      return apiFailure(503, "RESULT_DESCRIPTION_TOO_LONG");
    }
    if (error instanceof TrelloApiError) {
      stageCompleted(
        "result_card_write",
        resultWriteStartedAt,
        "failed",
        {
          code: "TRELLO_UPSTREAM_FAILURE",
          upstreamStatus: error.status,
        },
      );
      return upstreamFailure(error);
    }
    if (error instanceof ReconciliationConflictError) {
      stageCompleted(
        "result_card_write",
        resultWriteStartedAt,
        "failed",
        { code: "RECONCILIATION_CONFLICT" },
      );
    } else {
      stageCompleted(
        "result_card_write",
        resultWriteStartedAt,
        "failed",
        {
          code: "RECONCILIATION_FAILED",
          errorName: safeErrorName(error),
        },
      );
    }
    throw error;
  }
}
