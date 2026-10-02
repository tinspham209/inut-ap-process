const MANAGED_LABELS = [
  "Tháng báo cáo",
  "Cập nhật",
  "Tổng chi trong tháng",
  "Chi tiền mặt trong tháng",
  "Chi chuyển khoản trong tháng",
] as const;
const CATEGORY_SECTION_HEADING = "Chi theo hạng mục trong tháng:";
const CATEGORY_ROW_PATTERN = /^- .+: [\d,]+ VND$/;

export const TRELLO_DESCRIPTION_MAX_LENGTH = 16_384;

export interface ResultCardReport {
  month: string;
  asOf: string;
  totalSpentVnd: number;
  cashSpentVnd: number;
  bankTransferSpentVnd: number;
}

export interface CategorySpend {
  expenseType: string;
  spentVnd: number;
}

export interface ResultCardReportWithCategories extends ResultCardReport {
  spentByExpenseType: readonly CategorySpend[];
}

export class ResultCardDescriptionLimitError extends Error {
  constructor() {
    super("Rendered result description exceeds Trello's limit");
    this.name = "ResultCardDescriptionLimitError";
  }
}

export class ResultCardReportError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ResultCardReportError";
  }
}

function formatVietnamTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Result timestamp must be valid");
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string): string | undefined =>
    parts.find((item) => item.type === type)?.value;
  const day = part("day");
  const month = part("month");
  const year = part("year");
  const hour = part("hour");
  const minute = part("minute");
  if (!day || !month || !year || !hour || !minute) {
    throw new Error("Unable to format result timestamp in Vietnam time");
  }
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function renderManagedLines(report: ResultCardReportWithCategories): string[] {
  const formatVnd = (amount: number): string =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(amount);
  const values = [
    report.totalSpentVnd,
    report.cashSpentVnd,
    report.bankTransferSpentVnd,
  ];
  if (
    !/^\d{2}\/\d{4}$/.test(report.month) ||
    values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    BigInt(report.totalSpentVnd) !==
      BigInt(report.cashSpentVnd) + BigInt(report.bankTransferSpentVnd)
  ) {
    throw new ResultCardReportError(
      "Result report contains invalid totals or month",
    );
  }

  const seenExpenseTypes = new Set<string>();
  let categoryTotal = 0n;
  const categoryLines = report.spentByExpenseType.map((category) => {
    const expenseType = category.expenseType.trim();
    if (
      expenseType.length === 0 ||
      /[\r\n\u0000-\u001f\u007f]/.test(expenseType) ||
      seenExpenseTypes.has(expenseType) ||
      !Number.isSafeInteger(category.spentVnd) ||
      category.spentVnd <= 0
    ) {
      throw new ResultCardReportError(
        "Result report contains invalid category totals",
      );
    }
    seenExpenseTypes.add(expenseType);
    categoryTotal += BigInt(category.spentVnd);
    return `- ${expenseType}: ${formatVnd(category.spentVnd)} VND`;
  });

  if (categoryTotal !== BigInt(report.totalSpentVnd)) {
    throw new ResultCardReportError(
      "Result report category totals do not equal total",
    );
  }

  return [
    `${MANAGED_LABELS[0]}: ${report.month}`,
    `${MANAGED_LABELS[1]}: ${formatVietnamTimestamp(report.asOf)}`,
    `${MANAGED_LABELS[2]}: ${formatVnd(report.totalSpentVnd)} VND`,
    `${MANAGED_LABELS[3]}: ${formatVnd(report.cashSpentVnd)} VND`,
    `${MANAGED_LABELS[4]}: ${formatVnd(report.bankTransferSpentVnd)} VND`,
    CATEGORY_SECTION_HEADING,
    ...categoryLines,
  ];
}

function managedLabel(line: string): string | undefined {
  if (line === CATEGORY_SECTION_HEADING) {
    return CATEGORY_SECTION_HEADING;
  }
  return MANAGED_LABELS.find((label) => line.startsWith(`${label}:`));
}

export function renderResultDescription(
  existingDescription: string | null | undefined,
  report: ResultCardReportWithCategories,
): string {
  const managedLines = renderManagedLines(report);
  const existing = existingDescription ?? "";
  const newline = existing.includes("\r\n") ? "\r\n" : "\n";
  const lines = existing.split(/\r\n|\n/);
  const updatedLines: string[] = [];
  let inserted = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line === CATEGORY_SECTION_HEADING) {
      if (!inserted) {
        updatedLines.push(...managedLines);
        inserted = true;
      }
      while (
        index + 1 < lines.length &&
        CATEGORY_ROW_PATTERN.test(lines[index + 1] ?? "")
      ) {
        index += 1;
      }
    } else if (managedLabel(line)) {
      if (!inserted) {
        updatedLines.push(...managedLines);
        inserted = true;
      }
    } else {
      updatedLines.push(line);
    }
  }

  let result: string;
  if (inserted) {
    result = updatedLines.join(newline);
  } else if (existing.length === 0) {
    result = managedLines.join(newline);
  } else {
    const separator = existing.endsWith(`${newline}${newline}`)
      ? ""
      : existing.endsWith(newline)
        ? newline
        : `${newline}${newline}`;
    result = `${existing}${separator}${managedLines.join(newline)}`;
  }

  if (result.length > TRELLO_DESCRIPTION_MAX_LENGTH) {
    throw new ResultCardDescriptionLimitError();
  }
  return result;
}
