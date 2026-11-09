/**
 * Runtime status for the admin "System" page (GET /admin/system/status).
 *
 * SECURITY: the response is built only from enumerated values, numbers and
 * booleans. It never contains credentials, API keys, connection strings or
 * provider URLs — integrations report `configured: boolean` only, and the
 * courier `provider` is the enumerated COURIER_PROVIDER name.
 *
 * A database failure never fails the request: the database block reports
 * DISCONNECTED (latency and migration count null) and the endpoint stays 200.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { env } from "../env";
import { jobQueue, type JobQueue } from "../jobs/queue";
import { findPgError } from "../lib/db-errors";
import { cacheStore } from "../middleware/cache";
import { courierService } from "./courier/courier.service";
import { emailProvider } from "./notification/email.service";
import { smsProvider } from "./notification/sms.service";

export const DATABASE_PROBE_TIMEOUT_MS = 3_000;

/** SQLSTATEs meaning "the migrations journal does not exist yet". */
const UNDEFINED_TABLE = "42P01";
const INVALID_SCHEMA_NAME = "3F000";

export interface SystemStatusDTO {
  api: {
    status: "UP";
    uptimeSeconds: number;
    nodeEnv: string;
    timezone: string;
    version: string;
  };
  database: {
    status: "CONNECTED" | "DISCONNECTED";
    latencyMs: number | null;
    /** Rows in drizzle.__drizzle_migrations (0 when the journal is missing); null when DISCONNECTED. */
    migrationsApplied: number | null;
  };
  jobs: {
    queue: JobQueue["kind"];
    redisConfigured: boolean;
  };
  integrations: {
    courier: { provider: string; configured: boolean };
    sms: { configured: boolean };
    email: { configured: boolean };
  };
  cache: { entries: number };
}

/** Runs a statement and returns its rows (the Drizzle client's `execute`). */
export type SqlRunner = (query: SQL) => Promise<{ rows: Record<string, unknown>[] }>;

export interface SystemStatusDependencies {
  nodeEnv: string;
  timezone: string;
  redisUrl: string | undefined;
  courierProvider: string;
  runSql: SqlRunner;
  findCourier: (name: string) => { readonly isConfigured: boolean } | null;
  sms: { readonly isConfigured: boolean };
  email: { readonly isConfigured: boolean };
  queueKind: () => JobQueue["kind"];
  cacheEntries: () => number;
  uptimeSeconds: () => number;
  readVersion: () => Promise<string>;
  probeTimeoutMs: number;
}

const packageJsonSchema = z.object({ version: z.string().min(1) });
let cachedVersion: Promise<string> | null = null;

/** `version` from backend/package.json (read once; "unknown" if unreadable). */
export function readPackageVersion(): Promise<string> {
  cachedVersion ??= readFile(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")
    .then((text) => {
      const parsed = packageJsonSchema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data.version : "unknown";
    })
    .catch(() => "unknown");
  return cachedVersion;
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`database probe timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function defaultDependencies(): SystemStatusDependencies {
  return {
    nodeEnv: env.NODE_ENV,
    timezone: env.APP_TIMEZONE,
    redisUrl: env.REDIS_URL,
    courierProvider: env.COURIER_PROVIDER,
    runSql: (query) => db.execute(query),
    findCourier: (name) => courierService.find(name),
    sms: smsProvider,
    email: emailProvider,
    queueKind: () => jobQueue.kind,
    cacheEntries: () => cacheStore.size(),
    uptimeSeconds: () => Math.round(process.uptime()),
    readVersion: readPackageVersion,
    probeTimeoutMs: DATABASE_PROBE_TIMEOUT_MS,
  };
}

export class SystemService {
  private readonly deps: SystemStatusDependencies;

  constructor(overrides: Partial<SystemStatusDependencies> = {}) {
    this.deps = { ...defaultDependencies(), ...overrides };
  }

  async getStatus(): Promise<SystemStatusDTO> {
    const [database, version] = await Promise.all([this.probeDatabase(), this.deps.readVersion()]);
    const courier = this.deps.findCourier(this.deps.courierProvider);

    return {
      api: {
        status: "UP",
        uptimeSeconds: this.deps.uptimeSeconds(),
        nodeEnv: this.deps.nodeEnv,
        timezone: this.deps.timezone,
        version,
      },
      database,
      jobs: {
        queue: this.deps.queueKind(),
        redisConfigured: Boolean(this.deps.redisUrl),
      },
      integrations: {
        courier: { provider: this.deps.courierProvider, configured: courier?.isConfigured === true },
        sms: { configured: this.deps.sms.isConfigured },
        email: { configured: this.deps.email.isConfigured },
      },
      cache: { entries: this.deps.cacheEntries() },
    };
  }

  private async probeDatabase(): Promise<SystemStatusDTO["database"]> {
    const started = performance.now();
    try {
      await withTimeout(this.deps.runSql(sql`SELECT 1`), this.deps.probeTimeoutMs);
      const latencyMs = Math.round(performance.now() - started);
      const migrationsApplied = await withTimeout(this.countMigrations(), this.deps.probeTimeoutMs);
      return { status: "CONNECTED", latencyMs, migrationsApplied };
    } catch (error) {
      // Log the driver message server-side only; it may contain host names.
      console.error(
        JSON.stringify({
          level: "error",
          event: "system_status_db_probe_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return { status: "DISCONNECTED", latencyMs: null, migrationsApplied: null };
    }
  }

  private async countMigrations(): Promise<number> {
    try {
      const result = await this.deps.runSql(sql`SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`);
      const applied = Number(result.rows[0]?.applied ?? 0);
      return Number.isFinite(applied) ? applied : 0;
    } catch (error) {
      const code = findPgError(error)?.code;
      if (code === UNDEFINED_TABLE || code === INVALID_SCHEMA_NAME) return 0;
      throw error;
    }
  }
}

export const systemService = new SystemService();
