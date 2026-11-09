import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema/tables";
import * as enums from "./schema/enums";
import { assertLocalDatabase, sslOptionsFor, stripSslParams } from "./connection";

// HARD GUARD: the test suite mutates data. Never let it reach a remote database.
if (env.NODE_ENV === "test") {
  assertLocalDatabase(env.DATABASE_URL);
}

const connectionString = stripSslParams(env.DATABASE_URL);

/**
 * Application pool. In production DATABASE_URL points at Supabase's
 * transaction pooler (port 6543): node-postgres only uses unnamed prepared
 * statements, which is what transaction pooling requires.
 */
export const pool = new Pool({
  connectionString,
  ssl: sslOptionsFor(connectionString),
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: "my-oxygen-api",
});

// An idle client can error (e.g. the pooler closes it). Without a listener
// node-postgres would crash the process; log it and let the pool replace it.
pool.on("error", (err) => {
  console.error(
    JSON.stringify({ level: "error", event: "db_pool_idle_client_error", message: err.message }),
  );
});

export const db = drizzle(pool, { schema: { ...schema, ...enums } });
export type DatabaseClient = typeof db;
/** Transaction handle passed to `db.transaction(async (tx) => ...)`. */
export type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

let closing: Promise<void> | null = null;

/** Drains the pool. Safe to call more than once (graceful shutdown, test teardown). */
export function closeDb(): Promise<void> {
  if (!closing) {
    closing = pool.end();
  }
  return closing;
}
