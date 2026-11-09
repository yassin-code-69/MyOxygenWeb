import { defineConfig } from "drizzle-kit";
import { sslOptionsFor, stripSslParams } from "./src/db/connection";

/**
 * drizzle-kit configuration.
 *
 * Migrations run over DIRECT_URL (Supabase session pooler, port 5432) when it
 * is set, otherwise DATABASE_URL. There is deliberately no fallback URL.
 * Run through Bun so `.env` is loaded: `bun run db:migrate`.
 */
const rawUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();

if (!rawUrl) {
  throw new Error(
    "drizzle.config.ts: set DIRECT_URL or DATABASE_URL (see backend/.env.example).",
  );
}

const url = stripSslParams(rawUrl);

export default defineConfig({
  schema: ["./src/db/schema/enums.ts", "./src/db/schema/tables.ts"],
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: sslOptionsFor(url),
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
  strict: true,
  verbose: true,
});
