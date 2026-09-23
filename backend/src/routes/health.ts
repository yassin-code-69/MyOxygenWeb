import { Hono } from "hono";
import type { Context } from "hono";
import { pool } from "../db/client";

export const healthRoute = new Hono();

export async function handleHealthCheck(c: Context) {
  const start = performance.now();
  try {
    await pool.query("SELECT 1");
    const latencyMs = Math.round(performance.now() - start);

    return c.json(
      {
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: {
          status: "connected",
          latencyMs,
        },
      },
      200,
    );
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    return c.json(
      {
        status: "error",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: {
          status: "disconnected",
          latencyMs,
          error: (error as Error).message,
        },
      },
      503,
    );
  }
}

healthRoute.get("/", handleHealthCheck);
