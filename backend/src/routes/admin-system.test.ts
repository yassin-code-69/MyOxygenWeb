import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { db } from "../db/client";
import { env } from "../env";
import { jobQueue } from "../jobs/queue";
import { CourierService } from "../services/courier/courier.service";
import { MockCourierProvider } from "../services/courier/mock.provider";
import { SteadfastCourierProvider } from "../services/courier/steadfast.provider";
import { ResendEmailProvider } from "../services/notification/email.service";
import { SslWirelessSmsProvider } from "../services/notification/sms.service";
import { SystemService, type SystemStatusDTO } from "../services/system.service";
import { call, ManagementFixtures, type TestUser } from "../tests/management-fixtures";

const fixtures = new ManagementFixtures("sys");
let admin: TestUser;

beforeAll(async () => {
  admin = await fixtures.user("SUPER_ADMIN");
});

afterAll(async () => {
  await fixtures.cleanup();
});

/** Every configured env value that could be sensitive (credentials, keys, tokens, URLs). */
function sensitiveEnvValues(): string[] {
  const values: string[] = [env.DATABASE_URL, env.JWT_SECRET];
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && /(_KEY|_TOKEN|_SECRET|_PASSWORD|_URL|_SID)$/.test(key) && value.length >= 6) {
      values.push(value);
    }
  }
  return values;
}

function expectNoSecrets(json: string, secrets: readonly string[]): void {
  for (const secret of secrets) {
    expect(json.includes(secret)).toBe(false);
  }
}

describe("GET /admin/system/status", () => {
  it("reports api, database, jobs, integrations and cache status", async () => {
    const res = await call<SystemStatusDTO>("GET", "/admin/system/status", { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const pkg = JSON.parse(await readFile(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")) as {
      version: string;
    };
    const journal = await db.execute(sql`SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`);

    expect(res.body.data).toEqual({
      api: {
        status: "UP",
        uptimeSeconds: expect.any(Number),
        nodeEnv: "test",
        timezone: env.APP_TIMEZONE,
        version: pkg.version,
      },
      database: {
        status: "CONNECTED",
        latencyMs: expect.any(Number),
        migrationsApplied: Number(journal.rows[0]?.applied),
      },
      jobs: { queue: jobQueue.kind, redisConfigured: Boolean(env.REDIS_URL) },
      integrations: {
        courier: { provider: env.COURIER_PROVIDER, configured: true }, // .env.test uses the mock courier
        sms: { configured: false },
        email: { configured: false },
      },
      cache: { entries: expect.any(Number) },
    });
    expect(res.body.data.database.migrationsApplied).toBeGreaterThanOrEqual(5);
  });

  it("never contains the database URL, JWT secret or any key / token / URL from the environment", async () => {
    const res = await call<SystemStatusDTO>("GET", "/admin/system/status", { token: admin.token });
    expect(res.status).toBe(200);
    const secrets = sensitiveEnvValues();
    expect(secrets.length).toBeGreaterThanOrEqual(2);
    expectNoSecrets(res.text, secrets);
    expect(res.text).not.toContain("postgres");
    expect(res.text).not.toContain(new URL(env.DATABASE_URL).host);
  });
});

describe("SystemService", () => {
  it("reports configured integrations as booleans only, never their credentials", async () => {
    const secrets = {
      redis: "redis://:r3dis-Pa55w0rd@cache.internal:6379",
      steadfastKey: "sf-live-api-key-8f3a2b",
      steadfastSecret: "sf-live-secret-91c0de",
      steadfastUrl: "https://portal-user:portal-pass@steadfast.example/api",
      smsToken: "ssl-wireless-token-55aa",
      smsSid: "MYOXYGENSID77",
      smsUrl: "https://sms-user:sms-pass@sms.example/send",
      resendKey: "re_live_0123456789abcdef",
    };
    const courier = new CourierService(
      [
        new SteadfastCourierProvider({
          apiKey: secrets.steadfastKey,
          secretKey: secrets.steadfastSecret,
          baseUrl: secrets.steadfastUrl,
        }),
        new MockCourierProvider(),
      ],
      "steadfast",
    );
    const service = new SystemService({
      redisUrl: secrets.redis,
      courierProvider: "steadfast",
      findCourier: (name) => courier.find(name),
      sms: new SslWirelessSmsProvider({ apiToken: secrets.smsToken, sid: secrets.smsSid, baseUrl: secrets.smsUrl }),
      email: new ResendEmailProvider({ apiKey: secrets.resendKey, from: "shop@myoxygen.example" }),
      queueKind: () => "bullmq",
    });

    const status = await service.getStatus();
    expect(status.jobs).toEqual({ queue: "bullmq", redisConfigured: true });
    expect(status.integrations).toEqual({
      courier: { provider: "steadfast", configured: true },
      sms: { configured: true },
      email: { configured: true },
    });
    expectNoSecrets(JSON.stringify(status), [...Object.values(secrets), ...sensitiveEnvValues()]);
  });

  it("reports an unconfigured courier and missing Redis as false", async () => {
    const service = new SystemService({
      redisUrl: undefined,
      courierProvider: "steadfast",
      findCourier: (name) => new CourierService([new SteadfastCourierProvider({ apiKey: "", secretKey: "" })], "steadfast").find(name),
    });
    const status = await service.getStatus();
    expect(status.jobs.redisConfigured).toBe(false);
    expect(status.integrations.courier).toEqual({ provider: "steadfast", configured: false });
  });

  describe("database failures (still a status, never an error)", () => {
    let consoleError: ReturnType<typeof spyOn>;

    beforeAll(() => {
      consoleError = spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterAll(() => {
      consoleError.mockRestore();
    });

    it("reports DISCONNECTED when the database is unreachable", async () => {
      const unreachable = new Pool({ connectionString: "postgresql://postgres@127.0.0.1:1/none", connectionTimeoutMillis: 2_000 });
      unreachable.on("error", () => undefined);
      const broken = drizzle(unreachable);
      try {
        const status = await new SystemService({ runSql: (query) => broken.execute(query), probeTimeoutMs: 5_000 }).getStatus();
        expect(status.api.status).toBe("UP");
        expect(status.database).toEqual({ status: "DISCONNECTED", latencyMs: null, migrationsApplied: null });
        expect(JSON.stringify(status)).not.toContain("127.0.0.1");
      } finally {
        await unreachable.end();
      }
    }, 15_000);

    it("reports DISCONNECTED when the probe times out", async () => {
      const hanging = () => new Promise<{ rows: Record<string, unknown>[] }>(() => undefined);
      const status = await new SystemService({ runSql: hanging, probeTimeoutMs: 50 }).getStatus();
      expect(status.database).toEqual({ status: "DISCONNECTED", latencyMs: null, migrationsApplied: null });
    });

    it("reports 0 migrations when the drizzle journal does not exist", async () => {
      let calls = 0;
      const status = await new SystemService({
        runSql: async () => {
          calls += 1;
          if (calls === 1) return { rows: [{ "?column?": 1 }] };
          throw Object.assign(new Error('relation "drizzle.__drizzle_migrations" does not exist'), {
            code: "42P01",
            severity: "ERROR",
          });
        },
      }).getStatus();
      expect(status.database).toEqual({ status: "CONNECTED", latencyMs: expect.any(Number), migrationsApplied: 0 });
    });
  });
});
