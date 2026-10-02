import type { PaidCardIssue } from "../domain/paid-card.js";

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_MAX_RETRY_DELAY_MS = 5_000;

const safeFields = new Set([
  "Tiêu đề",
  "Số tiền",
  "Loại chi phí",
  "Hình thức thanh toán",
  "Ngày thanh toán",
  "Amazing Fields",
]);

const reasonLabels: Record<PaidCardIssue["reason"], string> = {
  missing: "thiếu",
  invalid_format: "sai định dạng",
  invalid_value: "giá trị không hợp lệ",
};

export type TelegramNotificationFailureReason =
  | "upstream_failure"
  | "invalid_response"
  | "retry_exhausted";

export interface TelegramNotificationResult {
  status: "sent" | "failed";
  omittedCardCount: number;
  totalInvalidCardCount: number;
  reason?: TelegramNotificationFailureReason;
}

export interface FormattedPaidDataIssues {
  text: string;
  omittedCardCount: number;
  totalInvalidCardCount: number;
}

export interface TelegramNotifierOptions {
  botToken: string;
  chatId: string;
  fetchImpl?: (input: URL, init: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

interface CardIssueGroup {
  cardId: string;
  cardUrl: string;
  details: Set<string>;
}

function canonicalTrelloCardUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid Trello card URL in issue");
  }
  const path = url.pathname.split("/").filter(Boolean);
  const shortLink = path[1];
  if (
    url.protocol !== "https:" ||
    url.hostname !== "trello.com" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0 ||
    path[0] !== "c" ||
    !shortLink ||
    !/^[A-Za-z0-9]{8}$/.test(shortLink)
  ) {
    throw new Error("Invalid Trello card URL in issue");
  }
  return `https://trello.com/c/${shortLink}`;
}

function formatVietnamTimestamp(asOf: Date): string {
  if (!Number.isFinite(asOf.getTime())) {
    throw new Error("Notification timestamp must be valid");
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(asOf);
  const part = (type: string): string | undefined =>
    parts.find((item) => item.type === type)?.value;
  const day = part("day");
  const month = part("month");
  const year = part("year");
  const hour = part("hour");
  const minute = part("minute");
  if (!day || !month || !year || !hour || !minute) {
    throw new Error("Unable to format notification timestamp");
  }
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function groupIssues(issues: readonly PaidCardIssue[]): CardIssueGroup[] {
  if (issues.length === 0) {
    throw new Error("At least one Paid-card issue is required");
  }

  const groups = new Map<string, CardIssueGroup>();
  for (const issue of issues) {
    if (!issue.cardId || !safeFields.has(issue.field)) {
      throw new Error("Unsupported issue field or card ID");
    }
    const reason = reasonLabels[issue.reason];
    if (!reason) {
      throw new Error("Unsupported issue reason");
    }
    const cardUrl = canonicalTrelloCardUrl(issue.cardUrl);
    const group = groups.get(issue.cardId);
    if (group && group.cardUrl !== cardUrl) {
      throw new Error("Inconsistent Trello URLs for one card");
    }
    const target =
      group ??
      {
        cardId: issue.cardId,
        cardUrl,
        details: new Set<string>(),
      };
    target.details.add(`${issue.field}: ${reason}`);
    groups.set(issue.cardId, target);
  }

  return [...groups.values()];
}

export function formatPaidDataIssues(
  issues: readonly PaidCardIssue[],
  asOf: Date,
): FormattedPaidDataIssues {
  const groups = groupIssues(issues);
  const header = [
    "Lỗi dữ liệu phiếu Paid",
    `Thời điểm: ${formatVietnamTimestamp(asOf)} giờ Việt Nam`,
    `Số phiếu lỗi: ${groups.length}`,
  ];
  const issueLines = groups.map(
    (group) =>
      `- ${group.cardUrl}\n  ${[...group.details].join("; ")}`,
  );

  for (let included = issueLines.length; included >= 0; included -= 1) {
    const omittedCardCount = groups.length - included;
    const lines = [
      ...header,
      ...issueLines.slice(0, included),
      ...(omittedCardCount > 0
        ? [`Còn ${omittedCardCount} phiếu chưa liệt kê.`]
        : []),
    ];
    const text = lines.join("\n");
    if (text.length <= TELEGRAM_MESSAGE_MAX_LENGTH) {
      return {
        text,
        omittedCardCount,
        totalInvalidCardCount: groups.length,
      };
    }
  }

  throw new Error("Unable to fit Telegram notification header in message limit");
}

function retryDelay(
  retryAfterHeader: string | null,
  attempt: number,
  retryDelayMs: number,
  maxRetryDelayMs: number,
  random: () => number,
): number | undefined {
  const header = retryAfterHeader?.trim();
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      const delay = seconds * 1000;
      return delay <= maxRetryDelayMs ? delay : undefined;
    }
  }

  const exponentialDelay = retryDelayMs * 2 ** (attempt - 1);
  const jitteredDelay = Math.ceil(
    exponentialDelay * (0.5 + Math.min(1, Math.max(0, random())) * 0.5),
  );
  return Math.min(maxRetryDelayMs, jitteredDelay);
}

export async function notifyPaidDataIssues(
  options: TelegramNotifierOptions,
  issues: readonly PaidCardIssue[],
  asOf: Date,
): Promise<TelegramNotificationResult> {
  if (!options.botToken.trim() || !options.chatId.trim()) {
    throw new Error("Telegram bot token and chat ID are required");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const maxRetryDelayMs =
    options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    !Number.isSafeInteger(retryDelayMs) ||
    retryDelayMs < 1 ||
    !Number.isSafeInteger(maxRetryDelayMs) ||
    maxRetryDelayMs < 1
  ) {
    throw new Error("Telegram timeout and retry values must be positive integers");
  }

  const formatted = formatPaidDataIssues(issues, asOf);
  const fetchImpl =
    options.fetchImpl ??
    ((input: URL, init: RequestInit) => fetch(input, init));
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;
  const endpoint = new URL(
    `/bot${options.botToken}/sendMessage`,
    TELEGRAM_API_BASE_URL,
  );

  let failureReason: TelegramNotificationFailureReason = "upstream_failure";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: options.chatId,
          text: formatted.text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      failureReason = "upstream_failure";
      if (attempt < maxAttempts) {
        await sleep(
          retryDelay(null, attempt, retryDelayMs, maxRetryDelayMs, random) ?? 0,
        );
        continue;
      }
      break;
    }

    if (response.status === 429 || response.status >= 500) {
      failureReason = "upstream_failure";
      if (attempt < maxAttempts) {
        const delay = retryDelay(
          response.headers.get("Retry-After"),
          attempt,
          retryDelayMs,
          maxRetryDelayMs,
          random,
        );
        if (delay !== undefined) {
          await sleep(delay);
          continue;
        }
        failureReason = "retry_exhausted";
      } else {
        failureReason = "retry_exhausted";
      }
      break;
    }
    if (!response.ok) {
      failureReason = "upstream_failure";
      break;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return {
        status: "failed",
        reason: "invalid_response",
        omittedCardCount: formatted.omittedCardCount,
        totalInvalidCardCount: formatted.totalInvalidCardCount,
      };
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("ok" in body) ||
      body.ok !== true
    ) {
      return {
        status: "failed",
        reason: "invalid_response",
        omittedCardCount: formatted.omittedCardCount,
        totalInvalidCardCount: formatted.totalInvalidCardCount,
      };
    }
    return {
      status: "sent",
      omittedCardCount: formatted.omittedCardCount,
      totalInvalidCardCount: formatted.totalInvalidCardCount,
    };
  }

  return {
    status: "failed",
    reason: failureReason,
    omittedCardCount: formatted.omittedCardCount,
    totalInvalidCardCount: formatted.totalInvalidCardCount,
  };
}
