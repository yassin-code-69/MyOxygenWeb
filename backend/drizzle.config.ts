import type { Config } from "drizzle-kit";

export default {
  schema: ["./src/db/schema/enums.ts", "./src/db/schema/tables.ts"],
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres.adwxwwcnxpcuwkjheqaj:MyOxygenSecurePass2026!@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
  },
} satisfies Config;
