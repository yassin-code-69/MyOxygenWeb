import { Hono } from "hono";
import type { Context } from "hono";
import { pool } from "../db/client";

export const healthRoute = new Hono();

export interface HealthUp {
  status: "UP";
  database: "CONNECTED";
  latencyMs: number;
  uptime: number;
  timestamp: string;
}

export interface HealthDown {
  status: "DOWN";
  database: "DISCONNECTED";
  uptime: number;
  timestamp: string;
}

/**
 * Deep health probe: pings the database. Deliberately outside the
 * `{ success, data }` envelope so load balancers / Docker healthchecks can
 * read it directly. Never exposes driver error text.
 */
export async function handleHealthCheck(c: Context): Promise<Response> {
  const start = performance.now();
  try {
    await pool.query("SELECT 1");
    const body: HealthUp = {
      status: "UP",
      database: "CONNECTED",
      latencyMs: Math.round(performance.now() - start),
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    c.header("Cache-Control", "no-store");
    return c.json(body, 200);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "health_check_db_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    const body: HealthDown = {
      status: "DOWN",
      database: "DISCONNECTED",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    c.header("Cache-Control", "no-store");
    return c.json(body, 503);
  }
}

healthRoute.get("/", handleHealthCheck);
