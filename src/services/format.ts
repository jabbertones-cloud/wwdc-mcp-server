/**
 * Response formatting helpers — markdown or json, both truncated to CHARACTER_LIMIT.
 */

import { CHARACTER_LIMIT } from "../constants.js";
import type { Pagination } from "../types.js";

export type ResponseFormat = "markdown" | "json";

export function truncate(text: string, limit = CHARACTER_LIMIT): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 120);
  return `${cut}\n\n…[truncated ${text.length - cut.length} chars. Use more specific query or higher offset.]`;
}

export function paginate<T>(items: T[], offset: number, limit: number, total?: number): {
  page: T[];
  pagination: Pagination;
} {
  const realTotal = total ?? items.length;
  const page = total !== undefined ? items : items.slice(offset, offset + limit);
  const end = offset + page.length;
  const hasMore = end < realTotal;
  return {
    page,
    pagination: {
      total: realTotal,
      count: page.length,
      offset,
      has_more: hasMore,
      next_offset: hasMore ? end : null,
    },
  };
}

export function formatResponse(
  format: ResponseFormat,
  markdown: string,
  data: unknown,
): string {
  if (format === "json") return formatJsonResponse(data);
  return truncate(markdown);
}

function formatJsonResponse(data: unknown): string {
  const full = JSON.stringify(data, null, 2);
  if (full.length <= CHARACTER_LIMIT) return full;

  for (const budget of [
    { maxArray: 10, maxString: 800 },
    { maxArray: 5, maxString: 400 },
    { maxArray: 3, maxString: 200 },
    { maxArray: 1, maxString: 120 },
  ]) {
    const compact = JSON.stringify({
      truncated: true,
      original_length: full.length,
      hint: "Response compacted to preserve valid JSON. Use lower limit, offset, or a more specific query for full rows.",
      data: compactJsonValue(data, budget),
    }, null, 2);
    if (compact.length <= CHARACTER_LIMIT) return compact;
  }

  const minimal = {
    truncated: true,
    original_length: full.length,
    hint: "Response too large after compaction. Use lower limit, offset, or a more specific query.",
    keys: data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data as Record<string, unknown>) : [],
  };
  return JSON.stringify(minimal, null, 2);
}

function compactJsonValue(value: unknown, budget: { maxArray: number; maxString: number }): unknown {
  if (typeof value === "string") {
    if (value.length <= budget.maxString) return value;
    return `${value.slice(0, budget.maxString)}…[truncated ${value.length - budget.maxString} chars]`;
  }
  if (Array.isArray(value)) {
    const page = value.slice(0, budget.maxArray).map((item) => compactJsonValue(item, budget));
    if (value.length > budget.maxArray) {
      page.push({ truncated_items: value.length - budget.maxArray });
    }
    return page;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, compactJsonValue(child, budget)]),
    );
  }
  return value;
}

export function errorText(message: string, hint?: string): string {
  return hint ? `Error: ${message}\nHint: ${hint}` : `Error: ${message}`;
}

// ---------------------------------------------------------------------------
// TL-009 fleet error envelope (see ~/workspace/testlabs/ERROR-ENVELOPE-STANDARD.md)
// Every domain error returns through toolError(): the familiar
// "Error: … / Hint: …" text block for continuity, PLUS structuredContent
// carrying a stable slug + status taxonomy so clients/models can branch on
// the failure class instead of scraping prose. Caller input reflected in a
// message is always passed through sanitizeEcho() first — bounded length,
// control characters stripped — so a not-found message can never reflect
// an unbounded injection string.
// ---------------------------------------------------------------------------

export type ErrorStatus =
  | "invalid_input"
  | "not_found"
  | "not_configured"
  | "not_performed"
  | "upstream_failure"
  | "internal";

export interface ToolErrorEnvelope {
  error: string;
  status: ErrorStatus;
  tool: string;
  message: string;
  hint?: string;
  retryable?: boolean;
  [extra: string]: unknown;
}

export const MAX_ERROR_ECHO = 80;

/** Bound + sanitise caller input before reflecting it in an error message. */
export function sanitizeEcho(value: unknown, max = MAX_ERROR_ECHO): string {
  const raw = typeof value === "string" ? value : String(value ?? "");
  // Strip C0/C1 control chars (incl. newlines/tabs) and collapse whitespace
  // so echoed input stays a single inert line of data.
  const cleaned = raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}…[+${cleaned.length - max} chars]`;
}

export function toolError(options: {
  tool: string;
  error: string;
  status: ErrorStatus;
  message: string;
  hint?: string;
  retryable?: boolean;
  fields?: Record<string, unknown>;
}): {
  isError: true;
  content: [{ type: "text"; text: string }];
  structuredContent: ToolErrorEnvelope;
} {
  const { tool, error, status, message, hint, retryable, fields } = options;
  const structuredContent: ToolErrorEnvelope = {
    error,
    status,
    tool,
    message,
    ...(hint ? { hint } : {}),
    ...(retryable ? { retryable: true } : {}),
    ...(fields ?? {}),
  };
  return {
    isError: true,
    content: [{ type: "text", text: errorText(message, hint) }],
    structuredContent,
  };
}
