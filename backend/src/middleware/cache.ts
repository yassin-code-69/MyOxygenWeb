import type { MiddlewareHandler } from "hono";

export interface CacheEntry {
  body: string;
  contentType: string;
  expiresAt: number;
}

export class MemoryLRUCache {
  private store = new Map<string, CacheEntry>();
  private readonly max: number;

  constructor(max = 500) {
    this.max = max;
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh LRU order (delete and re-insert at end)
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  set(
    key: string,
    value: Omit<CacheEntry, "expiresAt">,
    ttlSeconds: number,
  ): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.max) {
      // Evict oldest item (first key)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      ...value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  invalidatePrefix(prefix: string): number {
    let evicted = 0;
    for (const key of this.store.keys()) {
      if (key.includes(prefix) || key.startsWith(prefix)) {
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

// Shared cache store instance
export const cacheStore = new MemoryLRUCache(500);

/**
 * Creates a Hono middleware that caches successful GET responses in an in-memory LRU cache.
 *
 * @param ttlSeconds TTL in seconds (defaults to 60s)
 */
export function cacheMiddleware(ttlSeconds: number = 60): MiddlewareHandler {
  return async (c, next) => {
    // Only cache GET requests
    if (c.req.method !== "GET") {
      return next();
    }

    // Never cache authenticated / admin requests
    if (c.req.header("Authorization")) {
      return next();
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
        },
      });
      return;
    }

    // Execute handler
    await next();

    // Only cache successful 200 responses
    if (c.res && c.res.status === 200) {
      const contentType =
        c.res.headers.get("Content-Type") || "application/json";
      const body = await c.res.clone().text();

      cacheStore.set(cacheKey, { body, contentType }, ttlSeconds);

      c.res.headers.set("X-Cache", "MISS");
      c.res.headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
    }
  };
}

/**
 * Programmatically invalidate all cache entries whose keys match a prefix.
 */
export function invalidateCacheByPrefix(prefix: string): number {
  return cacheStore.invalidatePrefix(prefix);
}

/**
 * Clear the entire cache store.
 */
export function clearCache(): void {
  cacheStore.clear();
}
