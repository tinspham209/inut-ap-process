import { describe, expect, it, vi } from "vitest";
import { createTrelloClient, TrelloApiError } from "../src/trello/client.js";

const credentials = {
  apiKey: "synthetic-api-key",
  apiToken: "synthetic-api-token",
  boardId: "synthetic-board-short",
  paidListId: "synthetic-paid-list-id",
  resultCardId: "synthetic-result-short",
};
type FetchImplementation = (input: URL, init: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function card(id: string, closed = false) {
  return {
    id,
    name: "Synthetic card",
    idBoard: "synthetic-board-id",
    idList: "synthetic-paid-list-id",
    closed,
    shortLink: id,
    url: `https://trello.com/c/${id}`,
  };
}

function syntheticResultCard(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "canonical-result-card-id",
    name: "Synthetic result",
    idBoard: "canonical-board-id",
    idList: "synthetic-results-list-id",
    closed: false,
    shortLink: "synthetic-result-short",
    url: "https://trello.com/c/synthetic-result-short",
    ...overrides,
  };
}

function targetResponse(
  input: URL,
  resultCardOverrides: Record<string, unknown> = {},
): unknown {
  if (input.pathname === "/1/boards/synthetic-board-short") {
    return { id: "canonical-board-id", shortLink: "synthetic-board-short" };
  }
  if (input.pathname === "/1/boards/canonical-board-id/lists") {
    return [
      {
        id: "synthetic-paid-list-id",
        name: "Synthetic Paid",
        closed: false,
      },
      {
        id: "synthetic-results-list-id",
        name: "Synthetic Results",
        closed: false,
      },
    ];
  }
  if (input.pathname === "/1/cards/synthetic-result-short") {
    return syntheticResultCard(resultCardOverrides);
  }
  return null;
}

describe("Trello read client", () => {
  it("uses OAuth authorization headers without placing credentials in URLs", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async () =>
      jsonResponse({ id: "synthetic-board-id", shortLink: "synthetic-board" }),
    );
    const client = createTrelloClient({ ...credentials, fetchImpl });

    await client.getBoard("synthetic-board");

    const [requestUrl, requestInit] = fetchImpl.mock.calls[0]!;
    expect(String(requestUrl)).not.toContain(credentials.apiKey);
    expect(String(requestUrl)).not.toContain(credentials.apiToken);
    expect(new URL(String(requestUrl)).pathname).toBe(
      "/1/boards/synthetic-board",
    );
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toEqual({
      Accept: "application/json",
      Authorization:
        'OAuth oauth_consumer_key="synthetic-api-key", oauth_token="synthetic-api-token"',
    });
  });

  it("loads every page of active and archived board cards", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      card(`synthetic-card-${index + 1}`),
    );
    const secondPage = [card("synthetic-archived-card", true)];
    const fetchImpl = vi.fn<FetchImplementation>(async (input) => {
      const before = input.searchParams.get("before");
      return jsonResponse(before ? secondPage : firstPage);
    });
    const client = createTrelloClient({ ...credentials, fetchImpl });

    const cards = await client.getBoardCards("synthetic-board-id");

    expect(cards).toHaveLength(1001);
    expect(cards.at(-1)).toMatchObject({
      id: "synthetic-archived-card",
      closed: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain(
      "before=synthetic-card-1000",
    );
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "/1/boards/synthetic-board-id/cards/all",
    );
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method === "GET")).toBe(
      true,
    );
  });

  it("queries closed cards directly from the configured list", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async () =>
      jsonResponse([card("synthetic-archived-card", true)]),
    );
    const client = createTrelloClient({ ...credentials, fetchImpl });

    const cards = await client.getListCards(
      "synthetic-paid-list-id",
      "closed",
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]?.closed).toBe(true);
    const requestUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(requestUrl).toContain(
      "/1/lists/synthetic-paid-list-id/cards",
    );
    expect(requestUrl).toContain("filter=closed");
  });

  it("fails instead of returning incomplete cards when pagination stalls", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      card(`synthetic-card-${index + 1}`),
    );
    const fetchImpl = vi.fn<FetchImplementation>(async () =>
      jsonResponse(firstPage),
    );
    const client = createTrelloClient({ ...credentials, fetchImpl });

    await expect(
      client.getBoardCards("synthetic-board-id"),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reads board and card pluginData as opaque values", async () => {
    const pluginData = [
      { idPlugin: "synthetic-plugin-id", value: "synthetic-opaque-value" },
    ];
    const fetchImpl = vi.fn<FetchImplementation>(async (input) => {
      if (input.pathname.endsWith("/pluginData")) {
        return jsonResponse(pluginData);
      }
      return jsonResponse(card("synthetic-card-id"));
    });
    const client = createTrelloClient({ ...credentials, fetchImpl });

    await expect(
      client.getBoardPluginData("synthetic-board-id"),
    ).resolves.toEqual(pluginData);
    await expect(
      client.getCardPluginData("synthetic-card-id"),
    ).resolves.toEqual(pluginData);
  });

  it("reports Trello status without exposing the response body", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async () =>
      new Response("synthetic-sensitive-response-body", { status: 503 }),
    );
    const client = createTrelloClient({
      ...credentials,
      fetchImpl,
      maxAttempts: 1,
    });

    const error = await client
      .getBoard("synthetic-board-id")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TrelloApiError);
    if (!(error instanceof Error)) {
      throw new Error("Expected a sanitized API error");
    }
    expect(error.message).toContain("503");
    expect(error.message).not.toContain(
      "synthetic-sensitive-response-body",
    );
  });

  it("validates canonical targets before allowing a result-card-only write", async () => {
    const acquire = vi.fn(async () => {});
    const fetchImpl = vi.fn<FetchImplementation>(async (input, init) => {
      if (init.method === "PUT") {
        return jsonResponse({
          ...syntheticResultCard(),
          desc: "Synthetic report",
        });
      }
      return jsonResponse(targetResponse(input));
    });
    const client = createTrelloClient({
      ...credentials,
      fetchImpl,
      rateLimiter: { acquire },
    });

    await expect(
      client.updateResultCardDescription("Synthetic report"),
    ).rejects.toThrow(/verify configured targets/i);
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(client.verifyConfiguredTargets()).resolves.toEqual({
      boardId: "canonical-board-id",
      paidListId: "synthetic-paid-list-id",
      resultCardId: "canonical-result-card-id",
    });
    await client.updateResultCardDescription("Synthetic report");

    const write = fetchImpl.mock.calls.find(([, init]) => init.method === "PUT");
    expect(write).toBeDefined();
    expect(String(write?.[0])).toContain(
      "/1/cards/canonical-result-card-id",
    );
    expect(JSON.parse(String(write?.[1].body))).toEqual({
      desc: "Synthetic report",
    });
    expect(
      fetchImpl.mock.calls.filter(([, init]) => init.method === "PUT"),
    ).toHaveLength(1);
    expect(acquire).toHaveBeenCalledTimes(fetchImpl.mock.calls.length);
  });

  it.each([
    {
      name: "a result card on another board",
      overrides: { idBoard: "another-board-id" },
    },
    {
      name: "a result card in the Paid list",
      overrides: { idList: "synthetic-paid-list-id" },
    },
  ])("refuses $name before any write", async ({ overrides }) => {
    const fetchImpl = vi.fn<FetchImplementation>(async (input) =>
      jsonResponse(targetResponse(input, overrides)),
    );
    const client = createTrelloClient({ ...credentials, fetchImpl });

    await expect(client.verifyConfiguredTargets()).rejects.toThrow();
    expect(
      fetchImpl.mock.calls.some(([, init]) => init.method === "PUT"),
    ).toBe(false);
  });

  it("rejects a configured board ID that does not resolve canonically", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async () =>
      jsonResponse({
        id: "another-board-id",
        shortLink: "another-board-short",
      }),
    );
    const client = createTrelloClient({ ...credentials, fetchImpl });

    await expect(client.verifyConfiguredTargets()).rejects.toMatchObject({
      status: 502,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1].method).toBe("GET");
  });

  it("retries 429 responses with Retry-After and charges each attempt", async () => {
    const acquire = vi.fn(async () => {});
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "0" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "canonical-board-id",
          shortLink: "synthetic-board-short",
        }),
      );
    const client = createTrelloClient({
      ...credentials,
      fetchImpl,
      rateLimiter: { acquire },
      sleep,
      maxAttempts: 2,
    });

    await expect(client.getBoard(credentials.boardId)).resolves.toEqual({
      id: "canonical-board-id",
      shortLink: "synthetic-board-short",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(0);
  });

  it("bounds 429 retries without Retry-After and returns a service error", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn<FetchImplementation>(async () =>
      new Response("", { status: 429 }),
    );
    const client = createTrelloClient({
      ...credentials,
      fetchImpl,
      sleep,
      maxAttempts: 2,
      retryDelayMs: 10,
      maxRetryDelayMs: 20,
      random: () => 1,
    });

    await expect(client.getBoard(credentials.boardId)).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("stops when Retry-After exceeds the maximum wait", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn<FetchImplementation>(async () =>
      new Response("", {
        status: 429,
        headers: { "Retry-After": "60" },
      }),
    );
    const client = createTrelloClient({
      ...credentials,
      fetchImpl,
      sleep,
      maxAttempts: 3,
      maxRetryDelayMs: 1_000,
    });

    await expect(client.getBoard(credentials.boardId)).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("bounds GET transport retries and hides transport error details", async () => {
    const acquire = vi.fn(async () => {});
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn<FetchImplementation>(async (_input, init) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      throw new Error("synthetic transport detail");
    });
    const client = createTrelloClient({
      ...credentials,
      fetchImpl,
      rateLimiter: { acquire },
      sleep,
      maxAttempts: 2,
      retryDelayMs: 10,
      random: () => 1,
    });

    const error = await client
      .getBoard(credentials.boardId)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TrelloApiError);
    if (!(error instanceof Error)) {
      throw new Error("Expected a sanitized API error");
    }
    expect(error.message).not.toContain("synthetic transport detail");
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("does not retry a PUT with an ambiguous failure", async () => {
    const fetchImpl = vi.fn<FetchImplementation>(async (input, init) => {
      if (init.method === "PUT") {
        return new Response("", { status: 503 });
      }
      return jsonResponse(targetResponse(input));
    });
    const client = createTrelloClient({
      ...credentials,
      fetchImpl,
      maxAttempts: 3,
    });
    await client.verifyConfiguredTargets();

    await expect(
      client.updateResultCardDescription("Synthetic report"),
    ).rejects.toMatchObject({ status: 503, outcomeUnknown: true });
    expect(
      fetchImpl.mock.calls.filter(([, init]) => init.method === "PUT"),
    ).toHaveLength(1);
  });
});
