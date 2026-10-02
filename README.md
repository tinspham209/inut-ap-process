# Inut AP Process

Service for reconciling the current month's **paid expenses** from Trello's
`Paid` list into the description of one configured result card. Trello remains
the source of truth. The service does not create or edit expense cards, Amazing
Fields, labels, comments, assignments, or approval state, and it does not store
accounting data in a database.

The implementation follows [the technical specification](docs/specs.md),
[clarifications](docs/clarification.md), and the ordered
[implementation plan](docs/plan.md). This runbook does not authorize a live
board write, Telegram send, scheduled trigger, or production deployment.

## Local setup

Requirements: Node.js 22 and pnpm 11.5.3.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

Populate `.env` privately with the required test-board values. Do not paste
secrets into chat, command arguments, issue text, logs, or URLs. `.env` is
ignored by Git; `.env.example` contains names only. `pnpm dev` and `pnpm start`
load `.env` locally and fail fast if required configuration is missing or the
cron and button secrets are identical.

Local code verification uses synthetic fixtures and fake Trello/Telegram HTTP;
it does not read production data or send messages:

```sh
pnpm run typecheck
pnpm test
pnpm run build
```

`pnpm run verify:trello-read` is the separate, **read-only** board-test
compatibility probe. Its default P02 mode checks board/list/result-card
identity, pagination, and archived-Paid discovery. The P04 parser mode also
checks Amazing Fields CFG/FD decoding and timestamp timezone metadata. After
the archived fixture has been restored and P02 proof is recorded, P10 may run
the clean-board check as
`pnpm run verify:trello-read -- --allow-no-archived`. The optional flag does
not change the default archived-proof requirement. Every mode uses GET only;
output is redacted metadata and never contains field values or raw pluginData.

## Configuration check and logs

Before calling reconciliation, use the authenticated, read-only
`GET /v1/config-check` route:

```sh
curl -i \
  -H "Authorization: Bearer $RECONCILE_BUTTON_SECRET" \
  http://localhost:3000/v1/config-check
```

The route is protected by either the cron or button secret. It checks that the
process loaded the required environment, verifies Trello access and the
configured board/list/result-card targets, then reads and validates the
Amazing Fields board configuration. It does **not** update Trello or send
Telegram. A `200` with `"status":"ready"` means those checks passed. A `503`
returns safe check names/codes; `401` means the diagnostic request was not
authorized. Telegram is reported as `configured_not_tested`: the route only
checks that startup configuration was present and does not call Telegram or
prove that the token/chat is valid. If required variables are missing or
invalid, startup remains fail-fast; the server logs the configuration error
without printing values, and the route cannot run until startup succeeds.

`pnpm dev` uses Hono's built-in logger middleware with a sanitizing `PrintFunc`
and writes newline-delimited JSON logs to the terminal. Each request includes a
generated `requestId` (also returned as `X-Request-Id`), method, route, status
and duration. Reconciliation logs include only caller type, stage
(`trello_read`, `amazing_fields_config`, `paid_card_validation`,
`telegram_notification` or `result_card_write`), duration, outcome code,
upstream HTTP status when available, card/issue counts and notification status.
Authorization headers, query strings, request/response bodies, field values,
card URLs, pluginData and exception messages are not logged. Use the request ID
and safe error code to correlate a failure with its HTTP response.

Example diagnostic results:

```json
{"status":"ready","checks":[{"name":"environment","status":"passed"},{"name":"telegram_configuration","status":"configured_not_tested"},{"name":"trello_access_and_targets","status":"passed"},{"name":"amazing_fields_board_config","status":"passed"}]}
```

If a check fails, fix the indicated local configuration or Trello access and
call `GET /v1/config-check` again before `POST /v1/reconcile`.

## HTTP API

Run behind HTTPS. `GET /health` returns `{"status":"ok"}` and performs no
Trello or Telegram I/O. `POST /v1/reconcile` accepts an empty body and a
`Bearer` secret in `Authorization`:

| Caller | Header value |
| --- | --- |
| Manual Trello button | `Bearer <RECONCILE_BUTTON_SECRET>` |
| Cron | `Bearer <RECONCILE_CRON_SECRET>` |

Do not send the caller type in a query parameter or request body. Cron and
button secrets are independent. A successful response is returned only after
the result-card description is written and verified; it includes `month`,
`asOf`, `totalSpentVnd`, `cashSpentVnd`, `bankTransferSpentVnd`, and
`updatedCardUrl`.

| Status | Meaning |
| --- | --- |
| `400` | Non-empty or malformed request |
| `401` | Missing or invalid authorization |
| `409` | A reconciliation is already running or a checked source/target changed |
| `422` | Invalid Paid-card data or archived Paid card |
| `429` | Button success cooldown; includes `Retry-After` |
| `502` / `503` | Trello, Amazing Fields, Telegram, or service failure |

Only one run executes at a time in a process. A successful button run starts a
60-second cooldown at completion; failed runs do not. Cron bypasses the button
cooldown but not the in-progress lock. Lock and cooldown metadata are in RAM,
so a restart clears the cooldown. Run one service instance; multiple instances
do not share this state.

The service reads all cards associated with the configured Paid list, including
closed cards. An archived Paid card blocks publication and must be restored by
the board owner; the service never unarchives or changes it. A valid run
updates only the configured result card's five managed description lines and
preserves other description content. VND display amounts use comma-separated
thousands (for example, `1,000,000 VND`); API totals remain integer VND.
A field-data failure returns the complete
`issues` list and attempts one Telegram summary; the message may be shortened,
but the API issue list is not. A failed Telegram notification does not change
the original `422`.

## Manual Trello workflow

Trello Free/Amazing Fields Free does not enforce these role checks. People
remain responsible for the workflow and its activity history:

| List | Required human action |
| --- | --- |
| `Draft` | Requester creates the card, assigns themselves, fills amount, expense type and payment method, adds purpose/supporting documents, and leaves payment date empty. |
| `Requesting` | Requester moves the card, adds the director as an assignee, and comments with an @mention requesting approval. |
| `Approved` | Director approves and moves the card, adds Accounting as an assignee, and comments with an @mention handing it over. Accounting checks the documentation, amount, category and payment method before paying. |
| `Paid` | Accounting enters the actual payment date **and time** before moving the card, confirms the saved value, then comments with payment confirmation/date/method. Keep Paid cards in Paid; never archive, discard or delete them. |
| `Discard` | Only unpaid cards may be discarded. Comment the cancellation reason and mention relevant people before archiving. Reused requests return to Draft/Requesting and go through approval again. |

Comment every list move, including reversals. Comments and assignments are audit
and reminder mechanisms, not accounting inputs or proof that the API can
enforce role permissions.

## Operations and rollback

- Cron schedule: 19:00 `Asia/Ho_Chi_Minh` daily (12:00 UTC). Keep credentials in
  protected headers/environment, never in URLs or cron request bodies.
- Monitor non-2xx responses and configure the cron provider's HTTP-failure
  alert. Restrict access to responses/logs containing card links and issue
  details.
- For invalid data, open the linked card and ask the responsible requester or
  Accounting to correct it. Only Accounting enters the actual payment date.
- To roll back, disable cron and Trello Automation first, then stop the
  service. Do not delete or change Paid cards. Treat an old/incorrect summary as
  untrusted until a complete successful reconciliation updates it.

## Gates before live testing or production

The following are not established by mock tests or the read-only probe:

- A host with HTTPS, one persistent instance, and a verified request deadline.
- Permission for a successful test-board service run that writes only the
  result-card description. Synthetic Paid cards must not be deleted or archived
  for cleanup.
- Human verification of Draft/Requesting/Approved/Paid/Discard assignees,
  comments and archive procedure; Accounting's confirmation of expected
  Vietnam-time display.
- Operator access to the full issue list when Telegram truncates its summary,
  and real host/cron duration at the expected Paid-card count.
- G06: owner acceptance or redesign for cooldown reset on restart.
- G08: owner decision on the remaining race after Trello read-back; Trello
  conditional/atomic writes have not been established.
- G09: verify whether Trello Automation exposes the server's `429` and
  `Retry-After` to the button user; if not, update the approved operator
  expectation.
- A05: owner approval of the Telegram Bot API's required token-bearing HTTPS
  upstream path, with URL/exception redaction, **before any live Telegram
  send**.

Do not enable live Telegram, cron/Automation, or production until the applicable
gates and permissions are resolved. The currently configured test board has
an archived card associated with Paid; do not modify it without the board
owner's explicit direction.
