import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/tables";
import * as enums from "./schema/enums";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres.adwxwwcnxpcuwkjheqaj:MyOxygenSecurePass2026!@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema: { ...schema, ...enums } });
export type DatabaseClient = typeof db;
