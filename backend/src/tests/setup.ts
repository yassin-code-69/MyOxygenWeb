/**
 * `bun test` preload (see bunfig.toml). Runs before any test file is loaded
 * and aborts the whole run unless it targets a LOCAL test database.
 * Bun loads .env.test over .env when NODE_ENV=test (the default for `bun test`).
 */
import { assertLocalDatabase } from "../db/connection";

if (process.env.NODE_ENV !== "test") {
  throw new Error(`Tests must run with NODE_ENV=test (got "${process.env.NODE_ENV ?? "unset"}").`);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set for tests. Expected backend/.env.test to provide it.");
}

assertLocalDatabase(databaseUrl);

const directUrl = process.env.DIRECT_URL;
if (directUrl) {
  assertLocalDatabase(directUrl);
}
