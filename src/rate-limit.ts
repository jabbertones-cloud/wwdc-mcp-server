/**
 * Per-IP token-bucket rate limiting for MCP tool CALLS on the HTTP
 * transport (anti-extraction standard §3, STD-QUOTA-1/4).
 *
 * WWDC is a public product by design — anonymous free read is the
 * product, so there is deliberately no auth here. What the standard
 * still requires for a public surface is a quota: bulk oracle queries
 * against the audit judgment layer must cost the caller something.
 *
 * Shape (donor pattern: fleet weighted-tool-cost buckets, §3):
 * - One bucket per client IP, refilling continuously.
 * - Only JSON-RPC `tools/call` requests are charged; initialize,
 *   tools/list, ping and notifications are free, so a throttled caller
 *   can still discover the catalog and recover gracefully.
 * - A plain read costs 1 unit; `swift_app_audit` — the judgment/oracle
 *   tool — costs 5.
 * - Defaults are generous above legitimate agent use: burst 120 units,
 *   refill 120 units/minute (i.e. 24 audits or 120 reads per minute
 *   sustained). Operators tune via WWDC_MCP_TOOL_CALL_RATE_CAPACITY /
 *   WWDC_MCP_TOOL_CALL_RATE_REFILL_PER_MINUTE.
 * - 429s are opaque (STD-QUOTA-4): the caller learns only that they are
 *   throttled and when to retry (Retry-After) — never the bucket size,
 *   remaining balance, or which limit they hit.
 */
import type { IncomingMessage } from "node:http";

/** Weighted cost of the audit judgment tool; every other tool call costs 1. */
export const AUDIT_TOOL_COST = 5;
export const DEFAULT_TOOL_CALL_RATE_CAPACITY = 120;
export const DEFAULT_TOOL_CALL_RATE_REFILL_PER_MINUTE = 120;

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds the caller should wait before retrying; 0 when allowed. */
  retryAfterSeconds: number;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

/** Total weighted cost of the tool calls in a JSON-RPC body (0 for non-tool-call methods). */
export function toolCallCost(body: unknown): number {
  const messages = Array.isArray(body) ? body : [body];
  let cost = 0;
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const { method, params } = message as {
      method?: unknown;
      params?: { name?: unknown };
    };
    if (method !== "tools/call") continue;
    cost += params?.name === "swift_app_audit" ? AUDIT_TOOL_COST : 1;
  }
  return cost;
}

export class PerIpToolCallRateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(options: {
    capacity: number;
    refillPerSecond: number;
    maxKeys?: number;
    now?: () => number;
  }) {
    this.capacity = options.capacity;
    this.refillPerSecond = options.refillPerSecond;
    this.maxKeys = options.maxKeys ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  /** Charge `cost` units to `key`'s bucket; non-positive costs always pass. */
  check(key: string, cost: number): RateLimitDecision {
    if (cost <= 0) return { allowed: true, retryAfterSeconds: 0 };
    const nowMs = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) {
        // Bound memory under address churn: drop the oldest bucket.
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      bucket = { tokens: this.capacity, lastRefillMs: nowMs };
      this.buckets.set(key, bucket);
    }
    const elapsedSeconds = Math.max(0, (nowMs - bucket.lastRefillMs) / 1000);
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + elapsedSeconds * this.refillPerSecond,
    );
    bucket.lastRefillMs = nowMs;
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const deficit = cost - bucket.tokens;
    const retryAfterSeconds =
      this.refillPerSecond > 0
        ? Math.max(1, Math.ceil(deficit / this.refillPerSecond))
        : 60;
    return { allowed: false, retryAfterSeconds };
  }
}

function positiveEnvNumber(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Build the limiter from operator env (read at server-creation time). */
export function toolCallRateLimiterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PerIpToolCallRateLimiter {
  const capacity = positiveEnvNumber(
    env,
    "WWDC_MCP_TOOL_CALL_RATE_CAPACITY",
    DEFAULT_TOOL_CALL_RATE_CAPACITY,
  );
  const refillPerMinute = positiveEnvNumber(
    env,
    "WWDC_MCP_TOOL_CALL_RATE_REFILL_PER_MINUTE",
    DEFAULT_TOOL_CALL_RATE_REFILL_PER_MINUTE,
  );
  return new PerIpToolCallRateLimiter({
    capacity,
    refillPerSecond: refillPerMinute / 60,
  });
}

/**
 * Bucket key for a request. The socket address is the default — proxy
 * headers are only trusted when the operator opts in
 * (WWDC_MCP_TRUST_PROXY_HEADERS=1, e.g. behind the Cloudflare Worker
 * ingress, which sets cf-connecting-ip); trusting them unconditionally
 * would let a direct caller mint a fresh bucket per request by
 * rotating a header.
 */
export function clientKeyForRequest(
  req: IncomingMessage,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.WWDC_MCP_TRUST_PROXY_HEADERS === "1") {
    const cfIp = req.headers["cf-connecting-ip"];
    if (typeof cfIp === "string" && cfIp.trim()) return cfIp.trim();
    const forwarded = req.headers["x-forwarded-for"];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      ?.split(",")[0]
      ?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}
