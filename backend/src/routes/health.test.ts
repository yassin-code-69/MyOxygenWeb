import { describe, expect, it, spyOn } from "bun:test";
import { pool } from "../db/client";
import { app } from "../index";

describe("Deep Health Check Endpoint (GET /health)", () => {
  it("returns 200 UP with database latency", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("UP");
    expect(body.database).toBe("CONNECTED");
    expect(typeof body.latencyMs).toBe("number");
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.timestamp).toBe("string");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 DOWN without leaking driver error text when the database fails", async () => {
    const secretMessage = "password authentication failed for user postgres.abc at db.internal:6543";
    const querySpy = spyOn(pool, "query").mockImplementation(async () => {
      throw new Error(secretMessage);
    });
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const res = await app.request("/health");
      expect(res.status).toBe(503);

      const text = await res.text();
      expect(text).not.toContain(secretMessage);
      const body = JSON.parse(text);
      expect(body.status).toBe("DOWN");
      expect(body.database).toBe("DISCONNECTED");
      expect(body.latencyMs).toBeUndefined();
    } finally {
      querySpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
