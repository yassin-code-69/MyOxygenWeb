import { afterEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { errorHandler } from "./error-handler";
import { rateLimiter, rateLimiterSize, resetRateLimiter } from "./rate-limiter";

function buildApp(trustProxy: boolean, windowMs = 60_000) {
  const app = new Hono();
  app.onError(errorHandler);
  app.use("/limited", rateLimiter({ name: `test-${trustProxy}-${windowMs}`, maxRequests: 2, windowMs, trustProxy }));
  app.get("/limited", (c) => c.text("ok"));
  return app;
}

// Simulates a proxy that appends the observed peer address after a
// client-supplied (spoofable) value, like nginx's $proxy_add_x_forwarded_for.
const hit = (app: Hono, ip?: string, spoofed = "6.6.6.6") =>
  app.request("/limited", { headers: ip ? { "x-forwarded-for": `${spoofed}, ${ip}` } : {} });

describe("rateLimiter", () => {
  afterEach(() => resetRateLimiter());

  it("keys on X-Forwarded-For only when the proxy is trusted", async () => {
    const trusted = buildApp(true);
    expect((await hit(trusted, "1.1.1.1")).status).toBe(200);
    expect((await hit(trusted, "1.1.1.1")).status).toBe(200);
    expect((await hit(trusted, "1.1.1.1")).status).toBe(429);
    // A different client has its own budget.
    expect((await hit(trusted, "2.2.2.2")).status).toBe(200);
  });

  it("ignores client-supplied entries to the left of the proxy's address", async () => {
    const trusted = buildApp(true);
    expect((await hit(trusted, "5.5.5.5", "7.7.7.1")).status).toBe(200);
    expect((await hit(trusted, "5.5.5.5", "7.7.7.2")).status).toBe(200);
    // Rotating the spoofed prefix must not reset the real client's budget.
    expect((await hit(trusted, "5.5.5.5", "7.7.7.3")).status).toBe(429);
  });

  it("ignores spoofable headers when the proxy is not trusted", async () => {
    const untrusted = buildApp(false);
    expect((await hit(untrusted, "1.1.1.1")).status).toBe(200);
    expect((await hit(untrusted, "2.2.2.2")).status).toBe(200);
    const blocked = await hit(untrusted, "3.3.3.3");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    const body = await blocked.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("starts a new window once the previous one expires", async () => {
    const app = buildApp(true, 50);
    expect((await hit(app, "4.4.4.4")).status).toBe(200);
    expect((await hit(app, "4.4.4.4")).status).toBe(200);
    expect((await hit(app, "4.4.4.4")).status).toBe(429);
    await Bun.sleep(80);
    expect((await hit(app, "4.4.4.4")).status).toBe(200);
    expect(rateLimiterSize()).toBeGreaterThan(0);
  });
});
