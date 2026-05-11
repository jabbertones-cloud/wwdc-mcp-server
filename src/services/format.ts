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
  if (format === "json") return truncate(JSON.stringify(data, null, 2));
  return truncate(markdown);
}

export function errorText(message: string, hint?: string): string {
  return hint ? `Error: ${message}\nHint: ${hint}` : `Error: ${message}`;
}
