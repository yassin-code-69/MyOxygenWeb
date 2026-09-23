import { describe, it, expect, mock } from "bun:test";
import { app } from "../index";
import { pool } from "../db/client";

describe("Deep Health Check Endpoint (GET /health)", () => {
  it("should return 200 OK with database connection status and latencyMs", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.timestamp).toBe("string");
    expect(body.database).toBeDefined();
    expect(body.database.status).toBe("connected");
    expect(typeof body.database.latencyMs).toBe("number");
    expect(body.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("should return 503 Service Unavailable when database pool query fails", async () => {
    const originalQuery = pool.query.bind(pool);
    // Temporarily mock pool.query to fail
    (pool as any).query = mock(async () => {
      throw new Error("Connection pool timeout simulated");
    });

    try {
      const res = await app.request("/health");
      expect(res.status).toBe(503);

      const body = await res.json();
      expect(body.status).toBe("error");
      expect(body.database.status).toBe("disconnected");
      expect(body.database.error).toBe("Connection pool timeout simulated");
      expect(typeof body.database.latencyMs).toBe("number");
    } finally {
      (pool as any).query = originalQuery;
    }
  });
});
