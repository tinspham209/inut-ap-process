import LZString from "lz-string";

export const syntheticPluginId = "synthetic-plugin-id";
export const syntheticBoardId = "synthetic-board-id";

export const fieldIds = {
  amount: "synthetic-amount-field",
  expenseType: "synthetic-expense-type-field",
  paymentMethod: "synthetic-payment-method-field",
  paymentDate: "synthetic-payment-date-field",
  expenseOption: "synthetic-expense-option",
  cashOption: "synthetic-cash-option",
  transferOption: "synthetic-transfer-option",
} as const;

export const validFields: Array<Record<string, unknown>> = [
  {
    id: fieldIds.amount,
    name: "Số tiền",
    type: "N",
  },
  {
    id: fieldIds.expenseType,
    name: "Loại chi phí",
    type: "L",
    options: [{ id: fieldIds.expenseOption, text: "Synthetic expense" }],
    multi: { enabled: false, method: "any" },
  },
  {
    id: fieldIds.paymentMethod,
    name: "Hình thức thanh toán",
    type: "L",
    options: [
      { id: fieldIds.cashOption, text: "Tiền mặt" },
      { id: fieldIds.transferOption, text: "Chuyển khoản" },
    ],
    multi: { enabled: false, method: "any" },
  },
  {
    id: fieldIds.paymentDate,
    name: "Ngày thanh toán",
    type: "D",
  },
];

export const validConfig: Record<string, unknown> = {
  version: 19,
  boardId: syntheticBoardId,
  fields: validFields,
};

export const validCardData: Record<string, unknown> = {
  __version: 1,
  __boardId: syntheticBoardId,
  __lastEditSrvMs: 1_790_000_000_000,
  [fieldIds.amount]: 2_000_000,
  [fieldIds.expenseType]: [fieldIds.expenseOption],
  [fieldIds.paymentMethod]: [fieldIds.cashOption],
  [fieldIds.paymentDate]: "2026-09-29T04:30:00.000Z",
};

function pluginDataRecord(
  section: "CFG" | "FD",
  data: Record<string, unknown>,
  pluginId: string,
) {
  const compressed = LZString.compressToUTF16(JSON.stringify(data));
  return {
    idPlugin: pluginId,
    value: JSON.stringify({
      [section]: compressed,
      [`${section}-HASH`]: "synthetic-hash",
    }),
  };
}

export function makeAmazingFieldsFixture({
  config = validConfig,
  card = validCardData,
  pluginId = syntheticPluginId,
}: {
  config?: Record<string, unknown>;
  card?: Record<string, unknown>;
  pluginId?: string;
} = {}) {
  return {
    boardPluginData: [pluginDataRecord("CFG", config, pluginId)],
    cardPluginData: [pluginDataRecord("FD", card, pluginId)],
  };
}
