/**
 * Side-effect-free helpers for building Postgres connection settings.
 * Shared by the runtime pool (db/client.ts), drizzle.config.ts and scripts,
 * so it must NOT import `env` (drizzle-kit does not need JWT_SECRET etc.).
 */
import type { ConnectionOptions } from "node:tls";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Hostname of a postgres:// URL, or null when it cannot be parsed. Never logs the URL. */
export function databaseHost(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isLocalDatabaseHost(connectionString: string): boolean {
  const host = databaseHost(connectionString);
  return host !== null && LOCAL_HOSTS.has(host);
}

/**
 * TLS settings for a connection string.
 *
 * Local hosts connect without TLS. Remote hosts (Supabase) always use TLS.
 * `rejectUnauthorized: false` is deliberate: Supabase's pooler presents a
 * certificate chained to Supabase's own private root CA, which is not in the
 * public trust store. Traffic is still encrypted; to also verify the server,
 * download the project CA from the Supabase dashboard and pass it as `ca`
 * with `rejectUnauthorized: true`.
 */
export function sslOptionsFor(connectionString: string): false | ConnectionOptions {
  return isLocalDatabaseHost(connectionString) ? false : { rejectUnauthorized: false };
}

/**
 * Removes libpq TLS query parameters (`sslmode`, `sslrootcert`, ...).
 * node-postgres lets them override the explicit `ssl` option (e.g.
 * `sslmode=require` would turn certificate verification back on), so TLS is
 * configured solely through `sslOptionsFor`.
 */
export function stripSslParams(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    let changed = false;
    for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? url.toString() : connectionString;
  } catch {
    return connectionString;
  }
}

export class UnsafeTestDatabaseError extends Error {
  constructor(host: string | null) {
    super(
      `Refusing to connect: NODE_ENV is "test" but the database host is "${host ?? "unparseable"}". ` +
        "Tests may only run against localhost/127.0.0.1 (see backend/.env.test and `bun run test:db:up`).",
    );
    this.name = "UnsafeTestDatabaseError";
  }
}

/** Throws unless the URL points at a local database. Used as the test-safety guard. */
export function assertLocalDatabase(connectionString: string): void {
  if (!isLocalDatabaseHost(connectionString)) {
    throw new UnsafeTestDatabaseError(databaseHost(connectionString));
  }
}
