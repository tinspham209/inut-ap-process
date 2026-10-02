import { describe, expect, it, vi } from "vitest";
import {
  formatPaidDataIssues,
  notifyPaidDataIssues,
} from "../src/telegram/notifier.js";
import type { PaidCardIssue } from "../src/domain/paid-card.js";

type FetchImplementation = (input: URL, init: RequestInit) => Promise<Response>;

const asOf = new Date("2026-09-29T12:00:00.000Z");

function issue(
  cardId: string,
  shortLink: string,
  field = "Số tiền",
  reason: PaidCardIssue["reason"] = "missing",
): PaidCardIssue {
  return {
    cardId,
    cardUrl: `https://trello.com/c/${shortLink}/synthetic-title?source=fixture#top`,
    field,
    reason,
  };
}

describe("Telegram Paid-card notifier", () => {
  it("formats one safe link per card without including values or descriptions", () => {
    const formatted = formatPaidDataIssues(
      [
        issue("synthetic-card-1", "AbCd1234", "Số tiền", "missing"),
        issue(
          "synthetic-card-1",
          "AbCd1234",
          "Ngày thanh toán",
          "invalid_format",
        ),
        issue(
          "synthetic-card-2",
          "Wxyz9876",
          "Hình thức thanh toán",
          "invalid_value",
        ),
      ],
      asOf,
    );

    expect(formatted.text).toContain("29/09/2026 19:00");
    expect(formatted.text).toContain("Số phiếu lỗi: 2");
    expect(formatted.text).toContain("https://trello.com/c/AbCd1234");
    expect(formatted.text).toContain("https://trello.com/c/Wxyz9876");
    expect(formatted.text).toContain("Số tiền: thiếu");
    expect(formatted.text).toContain("Ngày thanh toán: sai định dạng");
    expect(formatted.text).not.toContain("?source=");
    expect(formatted.text).not.toContain("#top");
    expect(formatted.text).not.toContain("synthetic-card-1");
  });

  it("rejects unsafe URLs or unrecognized field/reason text", () => {
    expect(() =>
      formatPaidDataIssues(
        [
          {
            ...issue("synthetic-card", "AbCd1234"),
            cardUrl: "https://attacker.example/c/AbCd1234",
          },
        ],
        asOf,
      ),
    ).toThrow("Invalid Trello card URL");
    expect(() =>
      formatPaidDataIssues(
        [issue("synthetic-card", "AbCd1234", "Owner-controlled text")],
        asOf,
      ),
    ).toThrow("Unsupported issue field");
  });

  it("keeps the full issue count while truncating a long notification", () => {
    const issues = Array.from({ length: 300 }, (_, index) =>
      issue(`synthetic-card-${index}`, `AbCd${String(index).padStart(4, "0")}`),
    );
    const formatted = formatPaidDataIssues(issues, asOf);

    expect(formatted.text.length).toBeLessThanOrEqual(4096);
    expect(formatted.totalInvalidCardCount).toBe(300);
    expect(formatted.omittedCardCount).toBeGreaterThan(0);
    expect(formatted.text).toContain("Còn ");
    expect(formatted.text).toContain("phiếu chưa liệt kê.");
  });

  it("sends one aggregated message and never places bot credentials in the payload", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async (url, init) => {
      expect(url.hostname).toBe("api.telegram.org");
      expect(url.search).toBe("");
      expect(init.method).toBe("POST");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        chat_id: "synthetic-chat-id",
        disable_web_page_preview: true,
      });
      expect(JSON.stringify(body)).not.toContain("synthetic-bot-token");
      return Response.json({ ok: true });
    });

    const result = await notifyPaidDataIssues(
      {
        botToken: "synthetic-bot-token",
        chatId: "synthetic-chat-id",
        fetchImpl,
      },
      [issue("synthetic-card", "AbCd1234")],
      asOf,
    );

    expect(result).toMatchObject({ status: "sent", omittedCardCount: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors a finite number of times", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "0" } }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));

    const result = await notifyPaidDataIssues(
      {
        botToken: "synthetic-bot-token",
        chatId: "synthetic-chat-id",
        fetchImpl,
        sleep,
        maxAttempts: 2,
      },
      [issue("synthetic-card", "AbCd1234")],
      asOf,
    );

    expect(result.status).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(0);
  });

  it("returns an explicit failed status without leaking transport errors", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async () => {
      throw new Error("synthetic failure contains synthetic-bot-token");
    });
    const result = await notifyPaidDataIssues(
      {
        botToken: "synthetic-bot-token",
        chatId: "synthetic-chat-id",
        fetchImpl,
        maxAttempts: 2,
        sleep: async () => {},
      },
      [issue("synthetic-card", "AbCd1234")],
      asOf,
    );

    expect(result).toMatchObject({
      status: "failed",
      reason: "upstream_failure",
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-bot-token");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not treat a 200 response with ok=false as a successful notification", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async () =>
      Response.json({ ok: false }),
    );
    const result = await notifyPaidDataIssues(
      {
        botToken: "synthetic-bot-token",
        chatId: "synthetic-chat-id",
        fetchImpl,
        maxAttempts: 1,
      },
      [issue("synthetic-card", "AbCd1234")],
      asOf,
    );

    expect(result).toMatchObject({
      status: "failed",
      reason: "invalid_response",
    });
  });
});
