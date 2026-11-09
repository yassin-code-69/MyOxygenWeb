/**
 * In-process LRU cache for PUBLIC GET responses (catalog reads).
 *
 * Rules:
 * - Only anonymous requests are cached: any request carrying an
 *   Authorization header bypasses the cache and is answered with
 *   `Cache-Control: private, no-store` (its response may depend on the caller).
 * - Only 200 JSON responses are stored, keyed by the full URL.
 * - Every product / price / discount / stock change must call
 *   `invalidateCatalogCache()` AFTER its transaction commits.
 * - A response whose computation started before an invalidation is not
 *   stored (generation check), so a slow request can never re-insert data
 *   that a concurrent write just invalidated.
 */
import type { MiddlewareHandler } from "hono";

export interface CacheEntry {
  body: string;
  contentType: string;
  expiresAt: number;
}

export class MemoryLRUCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly max: number;
  private generationCounter = 0;

  constructor(max = 500) {
    this.max = max;
  }

  /** Incremented on every invalidation; used to drop stale in-flight writes. */
  get generation(): number {
    return this.generationCounter;
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh LRU position (Map preserves insertion order).
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  set(key: string, value: Omit<CacheEntry, "expiresAt">, ttlSeconds: number): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.max) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { ...value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.generationCounter++;
    this.store.clear();
  }

  /** Removes every entry whose key (a full URL) contains `prefix`. */
  invalidatePrefix(prefix: string): number {
    this.generationCounter++;
    let evicted = 0;
    // Deleting the current entry while iterating a Map is safe in JS.
    for (const key of this.store.keys()) {
      if (key.includes(prefix)) {
        this.store.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  size(): number {
    return this.store.size;
  }
}

/** Shared cache store instance. */
export const cacheStore = new MemoryLRUCache(500);

/** Adds `Authorization` to the Vary header without dropping values set by other middleware (CORS adds Origin). */
function varyOnAuthorization(headers: Headers): void {
  const current = headers.get("Vary");
  if (!current) {
    headers.set("Vary", "Authorization");
  } else if (!current.split(",").some((value) => value.trim().toLowerCase() === "authorization")) {
    headers.set("Vary", `${current}, Authorization`);
  }
}

/**
 * Caches successful anonymous GET responses for `ttlSeconds` and marks them
 * with `X-Cache: HIT | MISS`, `Cache-Control: public, max-age=<ttl>` and
 * `Vary: Authorization`.
 */
export function cacheMiddleware(ttlSeconds = 60): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== "GET") {
      await next();
      return;
    }

    if (c.req.header("Authorization")) {
      await next();
      c.res.headers.set("Cache-Control", "private, no-store");
      varyOnAuthorization(c.res.headers);
      return;
    }

    const cacheKey = c.req.url;
    const cached = cacheStore.get(cacheKey);
    if (cached) {
      c.res = new Response(cached.body, {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "X-Cache": "HIT",
          "Cache-Control": `public, max-age=${ttlSeconds}`,
          Vary: "Authorization",
        },
      });
      return;
    }

    const generation = cacheStore.generation;
    await next();

    const contentType = c.res.headers.get("Content-Type") ?? "";
    if (c.res.status === 200 && contentType.includes("application/json")) {
      if (cacheStore.generation === generation) {
        const body = await c.res.clone().text();
        cacheStore.set(cacheKey, { body, contentType }, ttlSeconds);
      }
      c.res.headers.set("X-Cache", "MISS");
      c.res.headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
      varyOnAuthorization(c.res.headers);
    }
  };
}

/** Invalidates every cache entry whose URL contains `prefix`. */
export function invalidateCacheByPrefix(prefix: string): number {
  return cacheStore.invalidatePrefix(prefix);
}

/**
 * Invalidate every cached public catalog response (product lists, product
 * details, flash sales, categories). Call it after any committed change to
 * products, prices, discounts or stock levels so storefront data stays fresh.
 */
export function invalidateCatalogCache(): number {
  return cacheStore.invalidatePrefix("/catalog/");
}

/** Clear the entire cache store. */
export function clearCache(): void {
  cacheStore.clear();
}
