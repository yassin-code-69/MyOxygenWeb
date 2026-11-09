/**
 * Throwaway PostgreSQL for the test-suite (no Docker required).
 *
 *   bun run scripts/test-db.ts up      # init (first time) + start on :54329, create DB, migrate, seed
 *   bun run scripts/test-db.ts down    # stop the cluster
 *   bun run scripts/test-db.ts reset   # drop + recreate DB, migrate, seed
 *   bun run scripts/test-db.ts status
 *   (add --no-seed to up/reset to skip seeding)
 *
 * Local mode (default): a private cluster in backend/.testdb/ owned by
 * user `postgres` with trust auth, bound to localhost only.
 * External mode (CI): set TEST_DATABASE_URL to an already running Postgres
 * (e.g. a service container on localhost); cluster init/start/stop is
 * skipped and only database creation, migrations and seeding run.
 *
 * Postgres binaries are located via PG_BIN, then PATH, then the default
 * install directories (Windows: C:/Program Files/PostgreSQL/<ver>/bin,
 * Debian/Ubuntu: /usr/lib/postgresql/<ver>/bin).
 *
 * Safety: this script never reads DATABASE_URL/DIRECT_URL (Bun loads .env,
 * which points at production) and refuses any non-local database URL.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { assertLocalDatabase, databaseHost } from "../src/db/connection";

const BACKEND_DIR = resolve(import.meta.dir, "..");
const TESTDB_DIR = join(BACKEND_DIR, ".testdb");
const DATA_DIR = join(TESTDB_DIR, "data");
const LOG_FILE = join(TESTDB_DIR, "postgres.log");
const MIGRATIONS_DIR = join(BACKEND_DIR, "src", "migrations");

const LOCAL_PORT = 54329;
const LOCAL_URL = `postgresql://postgres@localhost:${LOCAL_PORT}/my_oxygen_test`;

const externalUrl = process.env.TEST_DATABASE_URL?.trim() || undefined;
const testUrl = externalUrl ?? LOCAL_URL;
const manageCluster = externalUrl === undefined;

// Keys that must never leak from .env into child processes.
const SENSITIVE_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "JWT_SECRET",
  "REDIS_URL",
  "STEADFAST_API_KEY",
  "STEADFAST_SECRET_KEY",
  "SSL_WIRELESS_API_TOKEN",
  "SSL_WIRELESS_SID",
  "RESEND_API_KEY",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
];

function log(message: string): void {
  console.log(`[test-db] ${message}`);
}

function exe(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function versionDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => /^\d+(\.\d+)?$/.test(entry))
    .sort((a, b) => Number.parseFloat(b) - Number.parseFloat(a))
    .map((entry) => join(root, entry, "bin"));
}

function findPgBin(): string {
  const candidates: string[] = [];
  if (process.env.PG_BIN) candidates.push(process.env.PG_BIN);

  const onPath = Bun.which("initdb");
  if (onPath) candidates.push(resolve(onPath, ".."));

  if (process.platform === "win32") {
    candidates.push(...versionDirs("C:/Program Files/PostgreSQL"));
  } else {
    candidates.push(...versionDirs("/usr/lib/postgresql"));
    candidates.push("/usr/local/bin", "/opt/homebrew/bin", "/usr/bin");
  }

  for (const dir of candidates) {
    if (existsSync(join(dir, exe("initdb"))) && existsSync(join(dir, exe("pg_ctl")))) {
      return dir;
    }
  }
  throw new Error(
    "PostgreSQL binaries (initdb, pg_ctl) not found. Install PostgreSQL or set PG_BIN to its bin directory.",
  );
}

async function run(
  bin: string,
  args: string[],
  options: { detachOutput?: boolean } = {},
): Promise<void> {
  const proc = Bun.spawn([bin, ...args], {
    cwd: BACKEND_DIR,
    // pg_ctl start: the postmaster inherits pg_ctl's std handles. If those were
    // our stdout (often a pipe in CI), whoever reads that pipe would wait for
    // EOF until the server stops. Server output goes to the -l log file anyway.
    stdout: options.detachOutput ? "ignore" : "inherit",
    stderr: options.detachOutput ? "ignore" : "inherit",
    stdin: "ignore",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${bin} exited with code ${code}`);
  }
}

function logTail(lines = 20): string {
  try {
    const content = readFileSync(LOG_FILE, "utf8").trimEnd().split(/\r?\n/);
    return content.slice(-lines).join("\n");
  } catch {
    return "(no server log)";
  }
}

async function clusterRunning(pgBin: string): Promise<boolean> {
  if (!existsSync(join(DATA_DIR, "PG_VERSION"))) return false;
  const proc = Bun.spawn([join(pgBin, exe("pg_ctl")), "status", "-D", DATA_DIR], {
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await proc.exited) === 0;
}

async function initCluster(pgBin: string): Promise<void> {
  if (existsSync(join(DATA_DIR, "PG_VERSION"))) return;
  mkdirSync(TESTDB_DIR, { recursive: true });
  log(`initialising cluster in ${DATA_DIR}`);
  await run(join(pgBin, exe("initdb")), [
    "-D",
    DATA_DIR,
    "-U",
    "postgres",
    "--auth=trust",
    "-E",
    "UTF8",
    "--no-locale",
  ]);
}

async function startCluster(pgBin: string): Promise<void> {
  if (await clusterRunning(pgBin)) {
    log(`cluster already running on port ${LOCAL_PORT}`);
    return;
  }
  log(`starting cluster on localhost:${LOCAL_PORT}`);
  try {
    await run(
      join(pgBin, exe("pg_ctl")),
      [
        "start",
        "-D",
        DATA_DIR,
        "-l",
        LOG_FILE,
        "-w",
        "-t",
        "60",
        "-o",
        `-p ${LOCAL_PORT} -c listen_addresses=localhost -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
      ],
      { detachOutput: true },
    );
  } catch (error) {
    console.error(`[test-db] server log (${LOG_FILE}):\n${logTail()}`);
    throw error;
  }
}

async function stopCluster(pgBin: string): Promise<void> {
  if (!(await clusterRunning(pgBin))) {
    log("cluster is not running");
    return;
  }
  log("stopping cluster");
  await run(join(pgBin, exe("pg_ctl")), ["stop", "-D", DATA_DIR, "-m", "fast", "-w"], { detachOutput: true });
}

function databaseName(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error("Test database name must match [A-Za-z0-9_]+");
  }
  return name;
}

function adminUrl(url: string): string {
  const u = new URL(url);
  u.pathname = "/postgres";
  return u.toString();
}

async function withAdminClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: adminUrl(testUrl) });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureDatabase(): Promise<void> {
  const name = databaseName(testUrl);
  await withAdminClient(async (client) => {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (existing.rowCount === 0) {
      log(`creating database ${name}`);
      await client.query(`CREATE DATABASE "${name}"`);
    }
  });
}

async function dropDatabase(): Promise<void> {
  const name = databaseName(testUrl);
  await withAdminClient(async (client) => {
    log(`dropping database ${name}`);
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  });
}

async function runMigrations(): Promise<void> {
  log("applying migrations");
  const pool = new Pool({ connectionString: testUrl, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: MIGRATIONS_DIR,
      migrationsTable: "__drizzle_migrations",
      migrationsSchema: "drizzle",
    });
  } finally {
    await pool.end();
  }
}

async function runSeed(): Promise<void> {
  log("seeding");
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !SENSITIVE_KEYS.includes(key)) env[key] = value;
  }
  // The child loads .env.test for everything else (NODE_ENV=test).
  env.NODE_ENV = "test";
  env.DATABASE_URL = testUrl;
  env.DIRECT_URL = testUrl;

  const proc = Bun.spawn([process.execPath, "run", "src/db/seed.ts"], {
    cwd: BACKEND_DIR,
    env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`seed exited with code ${code}`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "up";
  const seed = !process.argv.includes("--no-seed");

  // Never touch anything that is not on this machine.
  assertLocalDatabase(testUrl);
  log(`target: ${databaseHost(testUrl)} (${manageCluster ? "managed local cluster" : "external TEST_DATABASE_URL"})`);

  const pgBin = manageCluster ? findPgBin() : null;

  switch (command) {
    case "up": {
      if (pgBin) {
        await initCluster(pgBin);
        await startCluster(pgBin);
      }
      await ensureDatabase();
      await runMigrations();
      if (seed) await runSeed();
      log("ready");
      break;
    }
    case "reset": {
      if (pgBin) {
        await initCluster(pgBin);
        await startCluster(pgBin);
      }
      await dropDatabase();
      await ensureDatabase();
      await runMigrations();
      if (seed) await runSeed();
      log("reset complete");
      break;
    }
    case "down": {
      if (pgBin) await stopCluster(pgBin);
      else log("external database: nothing to stop");
      break;
    }
    case "status": {
      if (pgBin) log((await clusterRunning(pgBin)) ? "running" : "stopped");
      else log("external database (not managed)");
      break;
    }
    default:
      throw new Error(`Unknown command "${command}". Use up | down | reset | status.`);
  }
}

main().catch((error: unknown) => {
  console.error(`[test-db] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
