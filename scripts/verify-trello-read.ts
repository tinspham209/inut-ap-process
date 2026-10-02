import {
  createTrelloClient,
  type TrelloPluginData,
} from "../src/trello/client.js";
import {
  parseAmazingFieldsCard,
  parseAmazingFieldsConfig,
} from "../src/trello/amazing-fields.js";

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function hasPluginData(records: TrelloPluginData[], pluginId: string): boolean {
  return records.some((record) => record.idPlugin === pluginId);
}

function allowsNoArchivedFixture(): boolean {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  if (args.some((argument) => argument !== "--allow-no-archived")) {
    throw new Error("Unsupported read-only verifier option");
  }
  return args.includes("--allow-no-archived");
}

async function verifyReadOnlyAccess(): Promise<void> {
  const allowNoArchivedFixture = allowsNoArchivedFixture();
  const apiKey = requiredEnvironmentVariable("TRELLO_API_KEY");
  const apiToken = requiredEnvironmentVariable("TRELLO_API_TOKEN");
  const boardIdInput = requiredEnvironmentVariable("TRELLO_BOARD_ID");
  const paidListId = requiredEnvironmentVariable("TRELLO_PAID_LIST_ID");
  const resultCardId = requiredEnvironmentVariable("TRELLO_RESULT_CARD_ID");
  const pluginId = requiredEnvironmentVariable("AMAZING_FIELDS_PLUGIN_ID");
  const client = createTrelloClient({
    apiKey,
    apiToken,
    boardId: boardIdInput,
    paidListId,
    resultCardId,
  });

  const board = await client.getBoard(boardIdInput);
  if (boardIdInput !== board.id && boardIdInput !== board.shortLink) {
    throw new Error("Configured board ID did not resolve to its canonical board");
  }

  const lists = await client.getBoardLists(board.id);
  if (!lists.some((list) => list.id === paidListId)) {
    throw new Error("Configured Paid list was not found on the configured board");
  }

  const resultCard = await client.getCard(resultCardId);
  if (resultCard.idBoard !== board.id || resultCard.idList === paidListId) {
    throw new Error("Configured result card is not a separate card on this board");
  }

  const boardCards = await client.getBoardCards(board.id);
  if (boardCards.some((card) => card.idBoard !== board.id)) {
    throw new Error("Board cards response contained a card outside the configured board");
  }
  const cardsById = new Map(
    boardCards
      .filter((card) => card.idList === paidListId)
      .map((card) => [card.id, card]),
  );
  if (![...cardsById.values()].some((card) => card.closed)) {
    const archivedCards = await client.getListCards(paidListId, "closed");
    if (
      archivedCards.some(
        (card) => card.idBoard !== board.id || card.idList !== paidListId,
      )
    ) {
      throw new Error("Archived list response contained a card outside the configured board or list");
    }
    for (const card of archivedCards) {
      cardsById.set(card.id, card);
    }
  }
  const cards = [...cardsById.values()];
  if (
    cards.some(
      (card) => card.idBoard !== board.id || card.idList !== paidListId,
    )
  ) {
    throw new Error("Paid list response contained a card outside the configured board or list");
  }
  const archivedPaidCount = cards.filter((card) => card.closed).length;
  if (archivedPaidCount === 0 && !allowNoArchivedFixture) {
    throw new Error(
      `No archived card was found in Paid on board ${board.id} (list ${paidListId}; ${cards.length} cards scanned); a permitted archived test fixture is required`,
    );
  }

  const boardPluginData = await client.getBoardPluginData(board.id);
  if (!hasPluginData(boardPluginData, pluginId)) {
    throw new Error("Amazing Fields board pluginData was not found");
  }
  const amazingFieldsConfig = parseAmazingFieldsConfig(
    boardPluginData,
    pluginId,
    board.id,
  );

  const sampleCard = cards.find((card) => !card.closed);
  if (!sampleCard) {
    throw new Error("No active Paid card is available for pluginData verification");
  }
  const cardPluginData = await client.getCardPluginData(sampleCard.id);
  if (!hasPluginData(cardPluginData, pluginId)) {
    throw new Error("Amazing Fields card pluginData was not found on an active Paid card");
  }
  const parsedFields = parseAmazingFieldsCard(
    cardPluginData,
    pluginId,
    amazingFieldsConfig,
  );

  console.log(
    JSON.stringify({
      status: "read-only verification passed",
      boardId: board.id,
      paidListId,
      resultCardId: resultCard.id,
      paidCardCount: cards.length,
      archivedPaidCount,
      boardPluginDataPresent: true,
      cardPluginDataPresent: true,
      amazingFieldsVersion: amazingFieldsConfig.version,
      requiredFieldCount: amazingFieldsConfig.fields.size,
      paymentTimestampHasTimezone: parsedFields.paidAt.endsWith("Z"),
    }),
  );
}

verifyReadOnlyAccess().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Read-only verification failed";
  console.error(message);
  process.exitCode = 1;
});
