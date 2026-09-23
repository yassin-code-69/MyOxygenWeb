import { createMiddleware } from "hono/factory";

interface RateLimitStore {
  count: number;
  resetTime: number;
}

export const clientHits = new Map<string, RateLimitStore>();

export function resetRateLimiter(): void {
  clientHits.clear();
}

export function rateLimiter(options: {
  maxRequests: number;
  windowMs: number;
}) {
  return createMiddleware(async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("x-real-ip") ||
      "unknown-client";
    const now = Date.now();

    const record = clientHits.get(ip);

    if (!record || now > record.resetTime) {
      clientHits.set(ip, { count: 1, resetTime: now + options.windowMs });
    } else {
      record.count += 1;
      if (record.count > options.maxRequests) {
        const retryAfter = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
        c.header("Retry-After", retryAfter.toString());
        return c.json(
          {
            success: false,
            error: "Too many requests. Please try again later.",
          },
          429,
        );
      }
    }

    await next();
  });
}
