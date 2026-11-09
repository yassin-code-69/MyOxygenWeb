import { describe, expect, it } from "bun:test";
import { EnvValidationError, loadEnv } from "./env";

const DATABASE_URL = "postgresql://postgres@localhost:54329/my_oxygen_test";

/** A valid development configuration (NODE_ENV must be explicit: unset means production). */
const VALID = {
  NODE_ENV: "development",
  DATABASE_URL,
  JWT_SECRET: "x".repeat(40),
};

function problemsOf(source: Record<string, string | undefined>): string[] {
  try {
    loadEnv(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error.problems;
    throw error;
  }
  throw new Error("expected loadEnv to fail");
}

describe("env validation", () => {
  it("fails closed: an unset NODE_ENV means production rules", () => {
    expect(loadEnv({ DATABASE_URL, JWT_SECRET: "x".repeat(64) }).NODE_ENV).toBe("production");
    // Production requires a 64+ character secret, so a 40-character dev secret is rejected.
    expect(problemsOf({ DATABASE_URL, JWT_SECRET: "x".repeat(40) }).some((p) => p.startsWith("JWT_SECRET:"))).toBe(true);
  });

  it("applies defaults for optional settings", () => {
    const env = loadEnv(VALID);
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGIN).toBe("http://localhost:3000");
    expect(env.DB_POOL_MAX).toBe(10);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.APP_TIMEZONE).toBe("Asia/Dhaka");
    expect(env.COURIER_PROVIDER).toBe("steadfast");
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it("requires DATABASE_URL and JWT_SECRET and never echoes values", () => {
    const problems = problemsOf({ JWT_SECRET: "short-secret-value" });
    expect(problems).toContain("DATABASE_URL: is required");
    expect(problems.some((p) => p.startsWith("JWT_SECRET:"))).toBe(true);
    expect(problems.join("\n")).not.toContain("short-secret-value");
  });

  it("treats empty strings as unset", () => {
    expect(problemsOf({ ...VALID, DATABASE_URL: "  " })).toContain("DATABASE_URL: is required");
    const env = loadEnv({ ...VALID, DIRECT_URL: "", REDIS_URL: "", PORT: "" });
    expect(env.DIRECT_URL).toBeUndefined();
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.PORT).toBe(4000);
  });

  it("parses booleans and numbers", () => {
    expect(loadEnv({ ...VALID, TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ ...VALID, TRUST_PROXY: "0" }).TRUST_PROXY).toBe(false);
    expect(loadEnv({ ...VALID, DB_POOL_MAX: "25" }).DB_POOL_MAX).toBe(25);
    expect(problemsOf({ ...VALID, TRUST_PROXY: "maybe" }).some((p) => p.startsWith("TRUST_PROXY"))).toBe(true);
    expect(problemsOf({ ...VALID, DB_POOL_MAX: "0" }).some((p) => p.startsWith("DB_POOL_MAX"))).toBe(true);
  });

  it("enforces production rules", () => {
    const problems = problemsOf({ ...VALID, NODE_ENV: "production", CORS_ORIGIN: "*" });
    expect(problems).toContain("JWT_SECRET: must be at least 64 characters in production");
    expect(problems.some((p) => p.startsWith("CORS_ORIGIN:"))).toBe(true);

    const ok = loadEnv({
      ...VALID,
      NODE_ENV: "production",
      JWT_SECRET: "y".repeat(64),
      CORS_ORIGIN: "https://myoxygen.com,https://admin.myoxygen.com",
    });
    expect(ok.NODE_ENV).toBe("production");
  });

  it("rejects invalid enums, URLs and time zones", () => {
    const problems = problemsOf({
      ...VALID,
      NODE_ENV: "staging",
      REDIS_URL: "not a url",
      APP_TIMEZONE: "Mars/Olympus",
      COURIER_PROVIDER: "pathao",
    });
    expect(problems.some((p) => p.startsWith("NODE_ENV: must be one of"))).toBe(true);
    expect(problems.some((p) => p.startsWith("REDIS_URL"))).toBe(true);
    expect(problems.some((p) => p.startsWith("APP_TIMEZONE"))).toBe(true);
    expect(problems.some((p) => p.startsWith("COURIER_PROVIDER"))).toBe(true);
    expect(problems.join("\n")).not.toContain("staging");
  });
});
