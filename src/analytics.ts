import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Low-sensitivity tool-call analytics — separate from leads.jsonl on purpose.
 * This file never contains dollar figures, contact info, or free-text notes;
 * only which tool was called, whether it succeeded, which error code fired,
 * and (for the two shape-driven tools) the enum inputs used. That's enough to
 * answer "is anyone using this" and "which tool description is confusing
 * models" without turning this into a second PII store.
 *
 * Module-anchored like leads.jsonl — process.cwd() depends on whatever
 * directory the MCP client launched from, not this package.
 */

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ANALYTICS_FILE = path.join(MODULE_DIR, "..", "analytics.jsonl");

export interface ToolCallOutcome {
  ok: boolean;
  errorCode?: string;
  meta?: Record<string, unknown>;
}

export function logToolCall(toolName: string, outcome: ToolCallOutcome): void {
  const record = {
    timestamp: new Date().toISOString(),
    tool: toolName,
    ok: outcome.ok,
    errorCode: outcome.errorCode ?? null,
    meta: outcome.meta ?? null,
  };

  // Logging must never be able to break a tool call.
  try {
    fs.appendFileSync(ANALYTICS_FILE, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // swallow — analytics is best-effort
  }

  console.error(
    `[melt-mcp] ${toolName} ${outcome.ok ? "ok" : `error:${outcome.errorCode ?? "unknown"}`}`
  );
}
