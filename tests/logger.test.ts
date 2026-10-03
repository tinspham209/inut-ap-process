import { describe, expect, it } from "vitest";
import { createServerLogger, type LogLevel } from "../src/logger.js";

describe("server logger", () => {
  it("serializes only allowlisted metadata and drops secret or payload fields", () => {
    const lines: Array<{ level: LogLevel; value: Record<string, unknown> }> = [];
    const logger = createServerLogger((level, line) => {
      lines.push({ level, value: JSON.parse(line) as Record<string, unknown> });
    });

    logger.error("reconciliation.completed", {
      requestId: "f50a8ad0-ec84-4c5d-93af-2eaa91c2fd1a",
      path: "/v1/reconcile",
      status: 503,
      code: "TRELLO_UPSTREAM_FAILURE",
      upstreamStatus: 401,
      apiToken: "synthetic-secret-token",
      requestBody: "synthetic financial payload",
      amountVnd: 99_999,
    });

    const encoded = JSON.stringify(lines);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe("error");
    expect(lines[0]?.value).toMatchObject({
      event: "reconciliation.completed",
      code: "TRELLO_UPSTREAM_FAILURE",
      status: 503,
      upstreamStatus: 401,
    });
    expect(encoded).not.toContain("synthetic-secret-token");
    expect(encoded).not.toContain("synthetic financial payload");
    expect(encoded).not.toContain("99_999");
  });

  it("rejects unrecognized values for nominally safe fields", () => {
    const lines: string[] = [];
    const logger = createServerLogger((_level, line) => lines.push(line));

    logger.info("synthetic-sensitive-event", {
      code: "SYNTHETIC_SECRET_VALUE",
      caller: "synthetic-sensitive-caller",
      path: "/token/secret-value",
      notificationStatus: "secret-token",
    });

    const output = lines.join("\n");
    expect(output).not.toContain("SYNTHETIC_SECRET_VALUE");
    expect(output).not.toContain("secret-value");
    expect(output).not.toContain("synthetic-sensitive-caller");
    expect(output).toContain('"event":"http.request.completed"');
  });

  it("allows the paid-trigger caller label without exposing credentials", () => {
    const lines: string[] = [];
    const logger = createServerLogger((_level, line) => lines.push(line));

    logger.info("reconciliation.started", {
      caller: "paid_trigger",
      requestId: "f50a8ad0-ec84-4c5d-93af-2eaa91c2fd1a",
    });

    expect(lines.join("\n")).toContain('"caller":"paid_trigger"');
  });
});
