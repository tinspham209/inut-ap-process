import LZString from "lz-string";
import type { TrelloPluginData } from "./client.js";

const SUPPORTED_CONFIG_VERSION = 19;
const SUPPORTED_CARD_VERSION = 1;

const expectedFieldTypes = {
  "Số tiền": "N",
  "Loại chi phí": "L",
  "Hình thức thanh toán": "L",
  "Ngày thanh toán": "D",
} as const;

export type AmazingFieldName = keyof typeof expectedFieldTypes;
const requiredFieldNames = [
  "Số tiền",
  "Loại chi phí",
  "Hình thức thanh toán",
  "Ngày thanh toán",
] as const satisfies readonly AmazingFieldName[];
export type AmazingFieldIssueReason =
  | "missing"
  | "invalid_format"
  | "invalid_value";
export type PaymentMethod = "Tiền mặt" | "Chuyển khoản";

interface AmazingFieldConfig {
  id: string;
  name: AmazingFieldName;
  type: (typeof expectedFieldTypes)[AmazingFieldName];
  options?: ReadonlyMap<string, string>;
}

export interface AmazingFieldsConfig {
  boardId: string;
  version: number;
  fields: ReadonlyMap<AmazingFieldName, AmazingFieldConfig>;
}

export interface ParsedPaidFields {
  amountVnd: number;
  expenseType: string;
  paymentMethod: PaymentMethod;
  paidAt: string;
}

export type AmazingFieldsCardInspection =
  | { status: "valid"; values: ParsedPaidFields }
  | {
      status: "invalid";
      issues: ReadonlyArray<{
        field: AmazingFieldName | "Amazing Fields";
        reason: AmazingFieldIssueReason;
      }>;
    };

export class AmazingFieldsConfigError extends Error {
  constructor(detail: string) {
    super(`Amazing Fields board configuration ${detail}`);
    this.name = "AmazingFieldsConfigError";
  }
}

export class AmazingFieldsCardDataError extends Error {
  readonly field: AmazingFieldName | "Amazing Fields";
  readonly reason: AmazingFieldIssueReason;

  constructor(
    field: AmazingFieldName | "Amazing Fields",
    reason: AmazingFieldIssueReason,
  ) {
    super(`Amazing Fields card data for ${field} is ${reason}`);
    this.name = "AmazingFieldsCardDataError";
    this.field = field;
    this.reason = reason;
  }
}

class PluginDataFormatError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAmazingFieldName(value: string): value is AmazingFieldName {
  return Object.hasOwn(expectedFieldTypes, value);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new PluginDataFormatError();
  }
}

function decompressSection(
  pluginData: TrelloPluginData[],
  pluginId: string,
  section: "CFG" | "FD",
): unknown {
  const records = pluginData.filter((record) => record.idPlugin === pluginId);
  if (records.length !== 1) {
    throw new PluginDataFormatError();
  }

  const recordValue = records[0]?.value;
  if (typeof recordValue !== "string") {
    throw new PluginDataFormatError();
  }
  const envelope = parseJson(recordValue);
  if (!isRecord(envelope) || typeof envelope[section] !== "string") {
    throw new PluginDataFormatError();
  }

  const decompressed = LZString.decompressFromUTF16(envelope[section]);
  if (typeof decompressed !== "string" || decompressed.length === 0) {
    throw new PluginDataFormatError();
  }
  return parseJson(decompressed);
}

function requiredString(
  value: Record<string, unknown>,
  property: string,
): string | undefined {
  const candidate = value[property];
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return undefined;
  }
  return candidate;
}

function parseOptions(value: unknown): ReadonlyMap<string, string> | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const options = new Map<string, string>();
  for (const item of value) {
    if (!isRecord(item)) {
      return undefined;
    }
    const id = requiredString(item, "id");
    const text = requiredString(item, "text");
    if (!id || !text || options.has(id)) {
      return undefined;
    }
    options.set(id, text);
  }
  return options;
}

function parseFieldConfig(
  value: unknown,
): AmazingFieldConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = requiredString(value, "id");
  const name = requiredString(value, "name");
  const type = requiredString(value, "type");
  if (
    !id ||
    !name ||
    !isAmazingFieldName(name) ||
    type !== expectedFieldTypes[name]
  ) {
    return undefined;
  }

  const fieldName = name;
  if (fieldName === "Loại chi phí" || fieldName === "Hình thức thanh toán") {
    const options = parseOptions(value.options);
    const multi = value.multi;
    if (
      !options ||
      !isRecord(multi) ||
      multi.enabled !== false
    ) {
      return undefined;
    }
    if (
      fieldName === "Hình thức thanh toán" &&
      (options.size !== 2 ||
        ![...options.values()].every(
          (option) => option === "Tiền mặt" || option === "Chuyển khoản",
        ) ||
        new Set(options.values()).size !== 2)
    ) {
      return undefined;
    }
    return { id, name: fieldName, type, options };
  }
  return { id, name: fieldName, type };
}

export function parseAmazingFieldsConfig(
  pluginData: TrelloPluginData[],
  pluginId: string,
  boardId: string,
): AmazingFieldsConfig {
  let decoded: unknown;
  try {
    decoded = decompressSection(pluginData, pluginId, "CFG");
  } catch {
    throw new AmazingFieldsConfigError("could not be decoded");
  }
  if (!isRecord(decoded)) {
    throw new AmazingFieldsConfigError("has an unsupported shape");
  }

  if (decoded.version !== SUPPORTED_CONFIG_VERSION) {
    throw new AmazingFieldsConfigError("has an unsupported version");
  }
  if (decoded.boardId !== boardId || !Array.isArray(decoded.fields)) {
    throw new AmazingFieldsConfigError("does not match the configured board or schema");
  }

  const fields = new Map<AmazingFieldName, AmazingFieldConfig>();
  const fieldIds = new Set<string>();
  for (const rawField of decoded.fields) {
    if (!isRecord(rawField)) {
      throw new AmazingFieldsConfigError("contains an invalid field");
    }
    const rawName = rawField.name;
    if (typeof rawName !== "string" || !isAmazingFieldName(rawName)) {
      continue;
    }
    const field = parseFieldConfig(rawField);
    if (!field || fields.has(field.name) || fieldIds.has(field.id)) {
      throw new AmazingFieldsConfigError("contains an invalid required field");
    }
    fields.set(field.name, field);
    fieldIds.add(field.id);
  }

  for (const name of requiredFieldNames) {
    if (!fields.has(name)) {
      throw new AmazingFieldsConfigError("is missing a required field");
    }
  }

  return {
    boardId,
    version: SUPPORTED_CONFIG_VERSION,
    fields,
  };
}

function cardDataError(
  field: AmazingFieldName,
  reason: AmazingFieldIssueReason,
): AmazingFieldsCardDataError {
  return new AmazingFieldsCardDataError(field, reason);
}

function getFieldConfig(
  config: AmazingFieldsConfig,
  name: AmazingFieldName,
): AmazingFieldConfig {
  const field = config.fields.get(name);
  if (!field) {
    throw new AmazingFieldsConfigError("is missing a required field");
  }
  return field;
}

function getCardFieldValue(
  data: Record<string, unknown>,
  field: AmazingFieldConfig,
): unknown {
  const value = data[field.id];
  if (value === undefined || value === null || value === "") {
    throw cardDataError(field.name, "missing");
  }
  return value;
}

function parseAmount(value: unknown, field: AmazingFieldConfig): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw cardDataError(field.name, "invalid_format");
  }
  if (value <= 0) {
    throw cardDataError(field.name, "invalid_value");
  }
  return value;
}

function parseOptionValue(
  value: unknown,
  field: AmazingFieldConfig,
): string {
  if (!Array.isArray(value)) {
    throw cardDataError(field.name, "invalid_format");
  }
  if (value.length !== 1) {
    throw cardDataError(field.name, "invalid_value");
  }
  const selectedOptionId = value[0];
  if (typeof selectedOptionId !== "string") {
    throw cardDataError(field.name, "invalid_format");
  }
  const options = field.options;
  const label = options?.get(selectedOptionId);
  if (!label) {
    throw cardDataError(field.name, "invalid_value");
  }
  return label;
}

function parsePaymentTimestamp(raw: unknown, field: AmazingFieldConfig): string {
  if (typeof raw !== "string") {
    throw cardDataError(field.name, "invalid_format");
  }
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/i.exec(
      raw,
    );
  if (!parts) {
    throw cardDataError(field.name, "invalid_format");
  }

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const offsetHour = parts[9] === undefined ? 0 : Number(parts[9]);
  const offsetMinute = parts[10] === undefined ? 0 : Number(parts[10]);
  const leapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  if (
    !daysInMonth ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    throw cardDataError(field.name, "invalid_format");
  }

  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    throw cardDataError(field.name, "invalid_format");
  }
  return new Date(timestamp).toISOString();
}

type FieldParse<T> =
  | { valid: true; value: T }
  | {
      valid: false;
      issue: {
        field: AmazingFieldName | "Amazing Fields";
        reason: AmazingFieldIssueReason;
      };
    };

function parseFieldValue<T>(
  field: AmazingFieldConfig,
  parse: () => T,
): FieldParse<T> {
  try {
    return { valid: true, value: parse() };
  } catch (error) {
    if (error instanceof AmazingFieldsCardDataError) {
      return {
        valid: false,
        issue: { field: error.field, reason: error.reason },
      };
    }
    throw error;
  }
}

export function inspectAmazingFieldsCard(
  pluginData: TrelloPluginData[],
  pluginId: string,
  config: AmazingFieldsConfig,
): AmazingFieldsCardInspection {
  const invalid = (
    field: AmazingFieldName | "Amazing Fields",
    reason: AmazingFieldIssueReason,
  ): AmazingFieldsCardInspection => ({
    status: "invalid",
    issues: [{ field, reason }],
  });

  let decoded: unknown;
  try {
    decoded = decompressSection(pluginData, pluginId, "FD");
  } catch {
    return invalid("Amazing Fields", "invalid_format");
  }
  if (!isRecord(decoded)) {
    return invalid("Amazing Fields", "invalid_format");
  }
  if (decoded.__version !== SUPPORTED_CARD_VERSION) {
    return invalid("Amazing Fields", "invalid_value");
  }
  if (decoded.__boardId !== config.boardId) {
    return invalid("Amazing Fields", "invalid_value");
  }
  if (
    typeof decoded.__lastEditSrvMs !== "number" ||
    !Number.isFinite(decoded.__lastEditSrvMs)
  ) {
    return invalid("Amazing Fields", "invalid_format");
  }

  const amountField = getFieldConfig(config, "Số tiền");
  const expenseTypeField = getFieldConfig(config, "Loại chi phí");
  const paymentMethodField = getFieldConfig(config, "Hình thức thanh toán");
  const paymentDateField = getFieldConfig(config, "Ngày thanh toán");
  const amount = parseFieldValue(amountField, () =>
    parseAmount(getCardFieldValue(decoded, amountField), amountField),
  );
  const expenseType = parseFieldValue(expenseTypeField, () =>
    parseOptionValue(
      getCardFieldValue(decoded, expenseTypeField),
      expenseTypeField,
    ),
  );
  const paymentMethod = parseFieldValue(paymentMethodField, () => {
    const value = parseOptionValue(
      getCardFieldValue(decoded, paymentMethodField),
      paymentMethodField,
    );
    if (value !== "Tiền mặt" && value !== "Chuyển khoản") {
      throw cardDataError("Hình thức thanh toán", "invalid_value");
    }
    return value;
  });
  const paidAt = parseFieldValue(paymentDateField, () =>
    parsePaymentTimestamp(
      getCardFieldValue(decoded, paymentDateField),
      paymentDateField,
    ),
  );

  const issues = [amount, expenseType, paymentMethod, paidAt].flatMap(
    (value) => (value.valid ? [] : [value.issue]),
  );
  if (
    !amount.valid ||
    !expenseType.valid ||
    !paymentMethod.valid ||
    !paidAt.valid
  ) {
    return { status: "invalid", issues };
  }

  return {
    status: "valid",
    values: {
      amountVnd: amount.value,
      expenseType: expenseType.value,
      paymentMethod: paymentMethod.value,
      paidAt: paidAt.value,
    },
  };
}

export function parseAmazingFieldsCard(
  pluginData: TrelloPluginData[],
  pluginId: string,
  config: AmazingFieldsConfig,
): ParsedPaidFields {
  const inspection = inspectAmazingFieldsCard(pluginData, pluginId, config);
  if (inspection.status === "invalid") {
    const issue = inspection.issues[0];
    if (!issue) {
      throw new AmazingFieldsCardDataError("Amazing Fields", "invalid_format");
    }
    throw new AmazingFieldsCardDataError(issue.field, issue.reason);
  }
  return inspection.values;
}
