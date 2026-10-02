import { describe, expect, it, vi } from "vitest";
import {
  renderResultDescription,
  ResultCardDescriptionLimitError,
} from "../src/result-card.js";
import {
  captureReconciliationSnapshot,
  ReconciliationConflictError,
  updateResultCardSafely,
  type ResultCardServiceClient,
} from "../src/reconcile.js";
import { TrelloApiError, type TrelloCard } from "../src/trello/client.js";

const targets = {
  boardId: "synthetic-board-id",
  paidListId: "synthetic-paid-list-id",
  resultCardId: "synthetic-result-card-id",
};
const pluginId = "synthetic-plugin-id";
const report = {
  month: "09/2026",
  asOf: "2026-09-29T12:00:00.000Z",
  totalSpentVnd: 5_000_000,
  cashSpentVnd: 2_000_000,
  bankTransferSpentVnd: 3_000_000,
};

interface TestState {
  description: string;
  boardConfigValue: string;
  sourceValue: string;
  paidCards: TrelloCard[];
  resultBoardId: string;
  resultListId: string;
  putBehavior: "normal" | "ambiguous-applied" | "ambiguous-not-applied";
}

function makeClient() {
  const state: TestState = {
    description: "Owner note\n\nFooter",
    boardConfigValue: "synthetic-cfg-payload",
    sourceValue: "synthetic-fd-payload",
    paidCards: [
      {
        id: "synthetic-paid-card",
        name: "Synthetic paid card",
        idBoard: targets.boardId,
        idList: targets.paidListId,
        closed: false,
        shortLink: "synthetic-paid-card",
        url: "https://trello.com/c/synthetic-paid-card",
      },
    ],
    resultBoardId: targets.boardId,
    resultListId: "synthetic-result-list-id",
    putBehavior: "normal",
  };
  const resultCard = (): TrelloCard => ({
    id: targets.resultCardId,
    name: "Synthetic result card",
    idBoard: state.resultBoardId,
    idList: state.resultListId,
    closed: false,
    shortLink: targets.resultCardId,
    url: `https://trello.com/c/${targets.resultCardId}`,
    description: state.description,
  });
  const update = vi.fn(async (description: string) => {
    if (state.putBehavior === "ambiguous-applied") {
      state.description = description;
      throw new TrelloApiError(503, "synthetic uncertain result", true);
    }
    if (state.putBehavior === "ambiguous-not-applied") {
      throw new TrelloApiError(503, "synthetic uncertain result", true);
    }
    state.description = description;
    return resultCard();
  });
  const client: ResultCardServiceClient = {
    verifyConfiguredTargets: async () => targets,
    getCard: async () => resultCard(),
    getBoardPluginData: async () => [
      { idPlugin: pluginId, value: state.boardConfigValue },
    ],
    getBoardCards: async () => state.paidCards,
    getCardPluginData: async () => [
      { idPlugin: pluginId, value: state.sourceValue },
    ],
    updateResultCardDescription: update,
  };

  return { client, state, update };
}

describe("result-card output and safe writer", () => {
  it("replaces managed labels, preserves surrounding content, and uses Vietnam time", () => {
    const oldDescription = [
      "Owner note",
      "Tháng báo cáo: 08/2026",
      "Tổng chi trong tháng: 100 VND",
      "Chi tiền mặt trong tháng: 40 VND",
      "Chi chuyển khoản trong tháng: 60 VND",
      "Cập nhật: 31/08/2026 19:00",
      "Footer",
    ].join("\n");

    const description = renderResultDescription(oldDescription, report);

    expect(description).toContain("Owner note");
    expect(description).toContain("Footer");
    expect(description).toContain("Tháng báo cáo: 09/2026");
    expect(description).toContain("Tổng chi trong tháng: 5,000,000 VND");
    expect(description).toContain("Chi tiền mặt trong tháng: 2,000,000 VND");
    expect(
      description,
    ).toContain("Chi chuyển khoản trong tháng: 3,000,000 VND");
    expect(description).toContain("Cập nhật: 29/09/2026 19:00");
    expect(description).not.toContain("08/2026");
  });

  it("formats common VND amounts with comma-separated thousands", () => {
    const amounts = [
      [42_000, "42,000"],
      [264_000, "264,000"],
      [1_234_567, "1,234,567"],
      [12_456_789, "12,456,789"],
      [123_456_789, "123,456,789"],
    ] as const;

    for (const [amount, formatted] of amounts) {
      const description = renderResultDescription("", {
        ...report,
        totalSpentVnd: amount,
        cashSpentVnd: amount,
        bankTransferSpentVnd: 0,
      });

      expect(description).toContain(
        `Tổng chi trong tháng: ${formatted} VND`,
      );
      expect(description).toContain(
        `Chi tiền mặt trong tháng: ${formatted} VND`,
      );
    }
  });

  it("is idempotent and appends missing managed labels only once", () => {
    const first = renderResultDescription("Owner note", report);

    expect(renderResultDescription(first, report)).toBe(first);
    for (const label of [
      "Tháng báo cáo:",
      "Tổng chi trong tháng:",
      "Chi tiền mặt trong tháng:",
      "Chi chuyển khoản trong tháng:",
      "Cập nhật:",
    ]) {
      expect(first.split("\n").filter((line) => line.startsWith(label))).toHaveLength(
        1,
      );
    }
  });

  it("rejects inconsistent totals and descriptions over the Trello limit", () => {
    expect(() =>
      renderResultDescription("", { ...report, totalSpentVnd: 6_000_000 }),
    ).toThrow("total");
    expect(() =>
      renderResultDescription("x".repeat(16_384), report),
    ).toThrow(ResultCardDescriptionLimitError);
  });

  it("writes once to the configured result card after an unchanged re-read", async () => {
    const { client, update } = makeClient();
    const snapshot = await captureReconciliationSnapshot(client, pluginId);

    const result = await updateResultCardSafely(
      client,
      pluginId,
      snapshot,
      report,
    );

    expect(result.updatedCardUrl).toBe(
      `https://trello.com/c/${targets.resultCardId}`,
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toContain(
      "Tổng chi trong tháng: 5,000,000 VND",
    );
  });

  it.each([
    "description",
    "membership",
    "card pluginData",
    "board CFG",
    "card title",
  ] as const)(
    "refuses to write when the %s changes after snapshot capture",
    async (change) => {
      const { client, state, update } = makeClient();
      const snapshot = await captureReconciliationSnapshot(client, pluginId);

      if (change === "description") {
        state.description = "Concurrent user edit";
      } else if (change === "membership") {
        state.paidCards = [
          ...state.paidCards,
          {
            id: "synthetic-new-paid-card",
            name: "Synthetic newly added card",
            idBoard: targets.boardId,
            idList: targets.paidListId,
            closed: false,
            shortLink: "synthetic-new-paid-card",
            url: "https://trello.com/c/synthetic-new-paid-card",
          },
        ];
      } else if (change === "card pluginData") {
        state.sourceValue = "synthetic-updated-fd-payload";
      } else if (change === "board CFG") {
        state.boardConfigValue = "synthetic-updated-cfg-payload";
      } else {
        const [sourceCard] = state.paidCards;
        if (!sourceCard) {
          throw new Error("Synthetic source card is missing");
        }
        state.paidCards = [{ ...sourceCard, name: "Synthetic changed title" }];
      }

      await expect(
        updateResultCardSafely(client, pluginId, snapshot, report),
      ).rejects.toBeInstanceOf(ReconciliationConflictError);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("stops when the result card is on the wrong board or in Paid", async () => {
    const { client, state, update } = makeClient();
    state.resultListId = targets.paidListId;
    await expect(
      captureReconciliationSnapshot(client, pluginId),
    ).rejects.toBeInstanceOf(ReconciliationConflictError);
    expect(update).not.toHaveBeenCalled();

    const wrongBoard = makeClient();
    wrongBoard.state.resultBoardId = "another-board-id";
    await expect(
      captureReconciliationSnapshot(wrongBoard.client, pluginId),
    ).rejects.toBeInstanceOf(ReconciliationConflictError);
    expect(wrongBoard.update).not.toHaveBeenCalled();
  });

  it("confirms an ambiguous PUT by reading the result card instead of retrying", async () => {
    const { client, state, update } = makeClient();
    state.putBehavior = "ambiguous-applied";
    const snapshot = await captureReconciliationSnapshot(client, pluginId);

    const result = await updateResultCardSafely(
      client,
      pluginId,
      snapshot,
      report,
    );

    expect(result.updatedCardUrl).toBe(
      `https://trello.com/c/${targets.resultCardId}`,
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(state.description).toContain("Tổng chi trong tháng: 5,000,000 VND");
  });

  it("returns the ambiguous write failure if the description was not committed", async () => {
    const { client } = makeClient();
    const update = vi.fn(async () => {
      throw new TrelloApiError(503, "synthetic uncertain result", true);
    });
    client.updateResultCardDescription = update;
    const snapshot = await captureReconciliationSnapshot(client, pluginId);

    await expect(
      updateResultCardSafely(client, pluginId, snapshot, report),
    ).rejects.toMatchObject({ status: 503, outcomeUnknown: true });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
