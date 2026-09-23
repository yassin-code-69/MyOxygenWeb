import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().default(
    "postgresql://postgres.adwxwwcnxpcuwkjheqaj:MyOxygenSecurePass2026!@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
  ),
  JWT_SECRET: z.string().min(32).default(
    "my_oxygen_super_secure_jwt_secret_token_2026_at_least_32_chars!"
  ),
  CORS_ORIGIN: z.string().default("*"),
});

export const env = envSchema.parse(process.env);
