import {
  SlidingWindowRateLimiter,
  type RequestRateLimiter,
} from "./rate-limit.js";

const TRELLO_API_BASE_URL = "https://api.trello.com/1/";
const CARD_PAGE_SIZE = 1000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_MAX_RETRY_DELAY_MS = 5_000;

export interface TrelloBoard {
  id: string;
  shortLink?: string;
}

export interface TrelloList {
  id: string;
  name: string;
  closed?: boolean;
}

export interface TrelloCard {
  id: string;
  name: string;
  idBoard: string;
  idList: string;
  closed: boolean;
  shortLink?: string;
  url?: string;
  description?: string;
}

export interface TrelloPluginData {
  idPlugin: string;
  value?: string;
}

export interface TrelloClientOptions {
  apiKey: string;
  apiToken: string;
  boardId: string;
  paidListId: string;
  resultCardId: string;
  fetchImpl?: (input: URL, init: RequestInit) => Promise<Response>;
  rateLimiter?: RequestRateLimiter;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

type TrelloCardFilter = "all" | "closed";
type HttpMethod = "GET" | "PUT";

export interface VerifiedTrelloTargets {
  boardId: string;
  paidListId: string;
  resultCardId: string;
}

export class TrelloApiError extends Error {
  readonly status: number;
  readonly outcomeUnknown: boolean;

  constructor(
    status: number,
    detail = "request failed",
    outcomeUnknown = false,
  ) {
    super(`Trello API ${detail} (HTTP ${status})`);
    this.name = "TrelloApiError";
    this.status = status;
    this.outcomeUnknown = outcomeUnknown;
  }
}

function invalidResponse(detail: string): TrelloApiError {
  return new TrelloApiError(502, `returned an invalid ${detail}`);
}

function asRecord(value: unknown, detail: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse(detail);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  detail: string,
): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw invalidResponse(detail);
  }
  return field;
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
  detail: string,
): string | undefined {
  const field = value[key];
  if (field === undefined || field === null) {
    return undefined;
  }
  if (typeof field !== "string") {
    throw invalidResponse(detail);
  }
  return field;
}

function parseBoard(value: unknown): TrelloBoard {
  const record = asRecord(value, "board");
  const shortLink = optionalString(record, "shortLink", "board");
  return {
    id: requiredString(record, "id", "board"),
    ...(shortLink ? { shortLink } : {}),
  };
}

function parseList(value: unknown): TrelloList {
  const record = asRecord(value, "list");
  const closed = record.closed;
  if (closed !== undefined && typeof closed !== "boolean") {
    throw invalidResponse("list");
  }
  return {
    id: requiredString(record, "id", "list"),
    name: requiredString(record, "name", "list"),
    ...(typeof closed === "boolean" ? { closed } : {}),
  };
}

function parseCard(value: unknown): TrelloCard {
  const record = asRecord(value, "card");
  if (typeof record.closed !== "boolean") {
    throw invalidResponse("card");
  }
  const shortLink = optionalString(record, "shortLink", "card");
  const url = optionalString(record, "url", "card");
  const description = optionalString(record, "desc", "card");
  return {
    id: requiredString(record, "id", "card"),
    name: requiredString(record, "name", "card"),
    idBoard: requiredString(record, "idBoard", "card"),
    idList: requiredString(record, "idList", "card"),
    closed: record.closed,
    ...(shortLink ? { shortLink } : {}),
    ...(url ? { url } : {}),
    ...(description === undefined ? {} : { description }),
  };
}

function parsePluginData(value: unknown): TrelloPluginData[] {
  if (!Array.isArray(value)) {
    throw invalidResponse("pluginData");
  }
  return value.map((item) => {
    const record = asRecord(item, "pluginData entry");
    const pluginDataValue = optionalString(record, "value", "pluginData entry");
    return {
      idPlugin: requiredString(record, "idPlugin", "pluginData entry"),
      ...(pluginDataValue === undefined ? {} : { value: pluginDataValue }),
    };
  });
}

function parseArray<T>(
  value: unknown,
  detail: string,
  parseItem: (item: unknown) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw invalidResponse(detail);
  }
  return value.map(parseItem);
}

export function createTrelloClient(options: TrelloClientOptions) {
  const fetchImpl =
    options.fetchImpl ??
    ((input: URL, init: RequestInit) => fetch(input, init));
  const rateLimiter =
    options.rateLimiter ?? new SlidingWindowRateLimiter();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const maxRetryDelayMs =
    options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;
  const authorization = `OAuth oauth_consumer_key="${options.apiKey}", oauth_token="${options.apiToken}"`;

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
    throw new Error("Trello timeout and retry values must be positive integers");
  }

  function retryDelay(
    retryAfterHeader: string | null,
    attempt: number,
  ): number | undefined {
    const header = retryAfterHeader?.trim();
    if (header) {
      const seconds = Number(header);
      const retryAt = Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(header) - Date.now();
      if (Number.isFinite(retryAt) && retryAt >= 0) {
        return retryAt <= maxRetryDelayMs ? retryAt : undefined;
      }
    }

    const exponentialDelay = retryDelayMs * 2 ** (attempt - 1);
    const jitteredDelay = Math.ceil(
      exponentialDelay * (0.5 + Math.min(1, Math.max(0, random())) * 0.5),
    );
    return Math.min(maxRetryDelayMs, jitteredDelay);
  }

  async function waitForRetry(
    retryAfterHeader: string | null,
    attempt: number,
    resource: string,
  ): Promise<void> {
    const delay = retryDelay(retryAfterHeader, attempt);
    if (delay === undefined) {
      throw new TrelloApiError(
        503,
        `${resource} retry delay exceeds the configured maximum`,
      );
    }
    await sleep(delay);
  }

  async function request(
    path: string,
    resource: string,
    params: Record<string, string> = {},
    method: HttpMethod = "GET",
    body?: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(path.replace(/^\/+/, ""), TRELLO_API_BASE_URL);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await rateLimiter.acquire();

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            Accept: "application/json",
            Authorization: authorization,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          signal: AbortSignal.timeout(timeoutMs),
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch {
        if (method === "GET" && attempt < maxAttempts) {
          await waitForRetry(null, attempt, resource);
          continue;
        }
        throw new TrelloApiError(
          503,
          `${resource} request failed`,
          method === "PUT",
        );
      }

      if (response.status === 429) {
        if (attempt < maxAttempts) {
          await waitForRetry(response.headers.get("Retry-After"), attempt, resource);
          continue;
        }
        throw new TrelloApiError(
          503,
          `${resource} rate-limit retries exhausted`,
        );
      }
      if (!response.ok) {
        if (method === "GET" && response.status >= 500 && attempt < maxAttempts) {
          await waitForRetry(null, attempt, resource);
          continue;
        }
        const status = response.status >= 500 ? 503 : response.status;
        throw new TrelloApiError(
          status,
          `${resource} request failed`,
          method === "PUT" && response.status >= 500,
        );
      }

      try {
        return (await response.json()) as unknown;
      } catch {
        const status = method === "PUT" ? 503 : 502;
        throw new TrelloApiError(
          status,
          `returned invalid JSON for ${resource}`,
          method === "PUT",
        );
      }
    }

    throw new TrelloApiError(503, `${resource} retries exhausted`);
  }

  async function getCardPages(
    path: string,
    resource: string,
    params: Record<string, string>,
  ): Promise<TrelloCard[]> {
    const cards = new Map<string, TrelloCard>();
    const seenCursors = new Set<string>();
    let before: string | undefined;

    for (;;) {
      const value = await request(path, resource, {
        ...params,
        limit: String(CARD_PAGE_SIZE),
        ...(before ? { before } : {}),
      });
      const page = parseArray(value, "cards", parseCard);
      for (const item of page) {
        cards.set(item.id, item);
      }
      if (page.length < CARD_PAGE_SIZE) {
        return [...cards.values()];
      }

      const nextCursor = page.at(-1)?.id;
      if (!nextCursor || seenCursors.has(nextCursor)) {
        throw new TrelloApiError(502, "card pagination did not advance");
      }
      seenCursors.add(nextCursor);
      before = nextCursor;
    }
  }

  let verifiedTargets: VerifiedTrelloTargets | undefined;

  async function getBoard(boardId: string): Promise<TrelloBoard> {
    const value = await request(
      `/boards/${encodeURIComponent(boardId)}`,
      "board metadata",
      { fields: "id,shortLink" },
    );
    return parseBoard(value);
  }

  async function getBoardLists(boardId: string): Promise<TrelloList[]> {
    const value = await request(
      `/boards/${encodeURIComponent(boardId)}/lists`,
      "board lists",
      { filter: "all", fields: "id,name,closed" },
    );
    return parseArray(value, "lists", parseList);
  }

  async function getCard(cardId: string): Promise<TrelloCard> {
    const value = await request(
      `/cards/${encodeURIComponent(cardId)}`,
      "card metadata",
      { fields: "id,name,idBoard,idList,closed,shortLink,url,desc" },
    );
    return parseCard(value);
  }

  async function verifyConfiguredTargets(): Promise<VerifiedTrelloTargets> {
    verifiedTargets = undefined;

    const board = await getBoard(options.boardId);
    if (options.boardId !== board.id && options.boardId !== board.shortLink) {
      throw new TrelloApiError(502, "configured board ID did not resolve canonically");
    }

    const lists = await getBoardLists(board.id);
    const paidList = lists.find((list) => list.id === options.paidListId);
    if (!paidList || paidList.closed) {
      throw new TrelloApiError(502, "configured Paid list was not found or is archived");
    }

    const resultCard = await getCard(options.resultCardId);
    if (
      (options.resultCardId !== resultCard.id &&
        options.resultCardId !== resultCard.shortLink) ||
      resultCard.idBoard !== board.id ||
      resultCard.idList === paidList.id ||
      resultCard.closed
    ) {
      throw new TrelloApiError(
        502,
        "configured result card is not a separate active card on the configured board",
      );
    }

    verifiedTargets = {
      boardId: board.id,
      paidListId: paidList.id,
      resultCardId: resultCard.id,
    };
    return verifiedTargets;
  }

  return {
    getBoard,
    getBoardLists,

    async getBoardCards(boardId: string): Promise<TrelloCard[]> {
      return getCardPages(
        `/boards/${encodeURIComponent(boardId)}/cards/all`,
        "board cards",
        { fields: "id,name,idBoard,idList,closed,shortLink,url" },
      );
    },

    async getListCards(
      listId: string,
      filter: TrelloCardFilter = "all",
    ): Promise<TrelloCard[]> {
      return getCardPages(
        `/lists/${encodeURIComponent(listId)}/cards`,
        "list cards",
        {
          filter,
          fields: "id,name,idBoard,idList,closed,shortLink,url",
        },
      );
    },

    getCard,

    async getBoardPluginData(boardId: string): Promise<TrelloPluginData[]> {
      const value = await request(
        `/boards/${encodeURIComponent(boardId)}/pluginData`,
        "board pluginData",
      );
      return parsePluginData(value);
    },

    async getCardPluginData(cardId: string): Promise<TrelloPluginData[]> {
      const value = await request(
        `/cards/${encodeURIComponent(cardId)}/pluginData`,
        "card pluginData",
      );
      return parsePluginData(value);
    },

    verifyConfiguredTargets,

    async updateResultCardDescription(
      description: string,
    ): Promise<TrelloCard> {
      const target = verifiedTargets;
      if (!target) {
        throw new Error("Verify configured targets before updating the result card");
      }

      const value = await request(
        `/cards/${encodeURIComponent(target.resultCardId)}`,
        "result card update",
        {},
        "PUT",
        { desc: description },
      );
      let updatedCard: TrelloCard;
      try {
        updatedCard = parseCard(value);
      } catch {
        throw new TrelloApiError(
          503,
          "result card update response could not be verified",
          true,
        );
      }
      if (
        updatedCard.id !== target.resultCardId ||
        updatedCard.idBoard !== target.boardId ||
        updatedCard.idList === target.paidListId
      ) {
        throw new TrelloApiError(
          503,
          "result card update response did not match the configured target",
          true,
        );
      }
      return updatedCard;
    },
  };
}
