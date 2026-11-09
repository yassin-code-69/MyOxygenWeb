/**
 * Fixed-window, in-memory rate limiter keyed by the real client IP.
 *
 * - The client IP comes from the Bun socket (`hono/bun` getConnInfo).
 * - `X-Forwarded-For` / `X-Real-IP` are only honoured when TRUST_PROXY=true
 *   (i.e. the API runs behind ONE reverse proxy that sets them); otherwise any
 *   client could spoof them to dodge the limit.
 * - With TRUST_PROXY the RIGHT-most `X-Forwarded-For` entry is used: it is the
 *   address our proxy observed. Entries to its left are client-controlled when
 *   the proxy appends (`$proxy_add_x_forwarded_for`), so they are never trusted.
 * - Expired buckets are pruned periodically so memory stays bounded.
 *
 * Single-instance only. For horizontal scaling move the buckets to Redis.
 */
import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { createMiddleware } from "hono/factory";
import { env } from "../env";
import { AppError } from "../lib/errors";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  /** Requests allowed per window per client. */
  maxRequests: number;
  windowMs: number;
  /** Bucket namespace so separate limiters do not share counters. */
  name?: string;
  /** Overrides env.TRUST_PROXY (mainly for tests). */
  trustProxy?: boolean;
}

const buckets = new Map<string, Bucket>();
const PRUNE_INTERVAL_MS = 60_000;
let lastPrune = Date.now();

function pruneExpired(now: number): void {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Clears all counters (tests). */
export function resetRateLimiter(): void {
  buckets.clear();
}

/** Number of live buckets (tests / diagnostics). */
export function rateLimiterSize(): number {
  return buckets.size;
}

/** The entry appended by the trusted proxy: the right-most non-empty value. */
function proxyObservedIp(value: string | undefined): string | undefined {
  const entries = value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries && entries.length > 0 ? entries[entries.length - 1] : undefined;
}

/** Best-effort client IP. Never throws. */
export function getClientIp(c: Context, trustProxy: boolean = env.TRUST_PROXY): string {
  if (trustProxy) {
    const forwarded =
      proxyObservedIp(c.req.header("x-forwarded-for")) ?? c.req.header("x-real-ip")?.trim();
    if (forwarded) return forwarded;
  }
  try {
    const address = getConnInfo(c).remote.address;
    if (address) return address;
  } catch {
    // Not served by Bun.serve (e.g. app.request() in tests): no socket info.
  }
  return "unknown";
}

export function rateLimiter(options: RateLimiterOptions) {
  const namespace = options.name ?? "default";
  return createMiddleware(async (c, next) => {
    const now = Date.now();
    pruneExpired(now);

    const ip = getClientIp(c, options.trustProxy ?? env.TRUST_PROXY);
    const key = `${namespace}:${ip}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > options.maxRequests) {
        const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        throw AppError.rateLimited("Too many requests. Please try again later.", retryAfterSeconds);
      }
    }

    await next();
  });
}
