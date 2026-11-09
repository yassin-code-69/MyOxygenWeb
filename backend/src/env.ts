/**
 * Typed, validated process environment.
 *
 * - Import `env` everywhere instead of reading `process.env` directly.
 * - Empty strings are treated as "not set".
 * - There are NO default secrets or connection strings: the process refuses
 *   to start with a readable list of problems (values are never printed).
 * - Bun loads `.env` automatically (and `.env.test` under `bun test`).
 */
import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = () => z.preprocess(emptyToUndefined, z.string().trim().optional());
const optionalUrl = () => z.preprocess(emptyToUndefined, z.string().trim().url().optional());
const optionalEmail = () => z.preprocess(emptyToUndefined, z.string().trim().email().optional());

const booleanFlag = (defaultValue: boolean) =>
  z.preprocess((value) => {
    const v = emptyToUndefined(value);
    if (v === undefined || typeof v === "boolean") return v;
    const normalized = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    return v;
  }, z.boolean().default(defaultValue));

/** Like booleanFlag but stays `undefined` when unset, so callers can derive a default. */
const optionalBooleanFlag = () =>
  z.preprocess((value) => {
    const v = emptyToUndefined(value);
    if (v === undefined || typeof v === "boolean") return v;
    const normalized = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    return v;
  }, z.boolean().optional());

const intWithDefault = (defaultValue: number, min: number, max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).default(defaultValue));

const isValidTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const envSchema = z
  .object({
    // --- Server ---
    // Fails closed: an unset NODE_ENV gets production behaviour (generic error
    // messages, no RBAC probe routes, no dev seed accounts, strict secrets).
    // Local development sets NODE_ENV=development in backend/.env.
    NODE_ENV: z.preprocess(
      emptyToUndefined,
      z.enum(["development", "production", "test"]).default("production"),
    ),
    PORT: intWithDefault(4000, 1, 65535),
    CORS_ORIGIN: z.preprocess(emptyToUndefined, z.string().trim().default("http://localhost:3000")),
    TRUST_PROXY: booleanFlag(false),
    APP_TIMEZONE: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .default("Asia/Dhaka")
        .refine(isValidTimeZone, { message: "must be a valid IANA time zone" }),
    ),
    FRONTEND_URL: optionalUrl(),

    // --- Database ---
    DATABASE_URL: z.preprocess(emptyToUndefined, z.string().trim().url()),
    DIRECT_URL: optionalUrl(),
    DB_POOL_MAX: intWithDefault(10, 1, 100),

    // --- Auth ---
    JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(32, "must be at least 32 characters")),

    // --- Background jobs ---
    REDIS_URL: optionalUrl(),

    // --- Courier ---
    COURIER_PROVIDER: z.preprocess(
      emptyToUndefined,
      z.enum(["steadfast", "mock"]).default("steadfast"),
    ),
    STEADFAST_API_KEY: optionalString(),
    STEADFAST_SECRET_KEY: optionalString(),
    STEADFAST_BASE_URL: optionalUrl(),

    // --- SMS (SSL Wireless) ---
    SSL_WIRELESS_API_TOKEN: optionalString(),
    SSL_WIRELESS_SID: optionalString(),
    SSL_WIRELESS_BASE_URL: optionalUrl(),

    // --- Email (Resend) ---
    RESEND_API_KEY: optionalString(),
    EMAIL_FROM: optionalString(),
    ADMIN_ALERT_EMAIL: optionalEmail(),

    // --- Seed (only read by src/db/seed.ts) ---
    SEED_ADMIN_EMAIL: optionalEmail(),
    SEED_ADMIN_PASSWORD: optionalString(),
    // Seed the demo catalog (products, batches, discounts). Unset = true outside
    // production, false in production (a production seed creates only categories + admin).
    SEED_DEMO_CATALOG: optionalBooleanFlag(),
  })
  .superRefine((cfg, ctx) => {
    const isProduction = cfg.NODE_ENV === "production";

    if (isProduction && cfg.JWT_SECRET.length < 64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "must be at least 64 characters in production",
      });
    }

    const origins = cfg.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
    if (origins.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message: "must list at least one origin",
      });
    }
    if (isProduction && origins.includes("*")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message: 'must not be "*" in production; list the allowed origins explicitly',
      });
    }

    if (cfg.SEED_ADMIN_PASSWORD !== undefined && cfg.SEED_ADMIN_PASSWORD.length < 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SEED_ADMIN_PASSWORD"],
        message: "must be at least 12 characters",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Formats Zod issues without ever echoing the offending value. */
function describeIssue(issue: z.ZodIssue): string {
  const key = issue.path.join(".") || "(root)";
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return issue.received === "undefined"
        ? `${key}: is required`
        : `${key}: expected ${issue.expected}`;
    case z.ZodIssueCode.invalid_enum_value:
      return `${key}: must be one of ${issue.options.map((o) => JSON.stringify(o)).join(", ")}`;
    case z.ZodIssueCode.invalid_string:
      return `${key}: must be a valid ${String(issue.validation)}`;
    default:
      return `${key}: ${issue.message}`;
  }
}

export class EnvValidationError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      `Invalid environment configuration (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        "\nSee backend/.env.example for the full list of variables.",
    );
    this.name = "EnvValidationError";
    this.problems = problems;
  }
}

/** Parses an environment source. Exported for unit tests; app code uses `env`. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues.map(describeIssue));
  }
  return result.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

/** Allowed CORS origins parsed from the comma separated `CORS_ORIGIN`. */
export const corsOrigins: readonly string[] = env.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
