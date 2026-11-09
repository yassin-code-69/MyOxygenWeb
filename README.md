# My Oxygen

E-commerce platform for **My Oxygen**, a single-owner mother & baby care retail brand in Bangladesh: a customer storefront (catalog, fuzzy search, flash sales, cart, 3-step checkout, order tracking) and a back-office for staff (products, batch/expiry inventory with FEFO allocation, orders and courier dispatch, PDF invoices, stock audit ledger, analytics).

Prices are in Bangladeshi Taka (৳, BDT); business dates use `Asia/Dhaka`.

> The model is **single-owner**: no vendors, merchant payouts or multi-tenant sellers. See [`context/RULES.md`](context/RULES.md).

---

## Contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Seeded development accounts](#seeded-development-accounts)
- [Testing](#testing)
- [Useful scripts](#useful-scripts)
- [Environment variables](#environment-variables)
- [Docker](#docker)
- [Continuous integration](#continuous-integration)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Further documentation](#further-documentation)

---

## Architecture

```
                 Browser — storefront (/) and back-office (/admin)
                    │                                   │
       HTML / JS    │                                   │  JSON over HTTPS (CORS)
                    ▼                                   ▼  Authorization: Bearer <JWT>
   ┌───────────────────────────────┐   ┌──────────────────────────────────────────┐
   │ frontend/   Next.js 16  :3000 │   │ backend/   Bun + Hono API          :4000 │
   │ React 19 · Mantine 9          │   │ routes → services → Drizzle ORM          │
   │ SWR hooks · Zustand stores    │   │ Zod validation · jose JWT · RBAC         │
   │ standalone Node server        │   │ FEFO inventory · invoices (pdf-lib)      │
   └───────────────────────────────┘   │ in-process jobs (node-cron)              │
                                       └───────┬──────────────┬───────────┬───────┘
          NEXT_PUBLIC_API_URL is inlined       │              │           │
          into the bundle at build time        ▼              ▼           ▼
                                  Supabase PostgreSQL   Redis (optional,  Steadfast courier
                                  (Supavisor pooler)    BullMQ queues)    SSL Wireless SMS
                                  :6543 transaction —                     Resend email
                                        API runtime
                                  :5432 session —
                                        migrations
```

- The browser talks to the API directly; the Next.js server does not proxy API calls.
- Every API response uses one envelope: `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }` (see [`backend/README.md`](backend/README.md)).
- Stock-changing operations (checkout, batch intake, adjustments) run in database transactions with row locks (`SELECT … FOR UPDATE`), allocating batches First-Expired-First-Out.
- Row Level Security is enabled on every table with **no** policies: the API connects as the table owner, and Supabase's public Data API roles (`anon`, `authenticated`) see nothing.

## Tech stack

| Area | Backend (`backend/`) | Frontend (`frontend/`) |
|---|---|---|
| Runtime | Bun 1.4 | Node.js ≥ 20.9 (24 LTS in Docker/CI), Bun as package manager |
| Framework | Hono 4 | Next.js 16 (App Router, `output: "standalone"`), React 19 |
| Data | Drizzle ORM + node-postgres, Supabase PostgreSQL, `pg_trgm` | SWR (server data), Zustand (cart, auth session) |
| Validation | Zod 3 (`@hono/zod-validator`) | Zod 4 with `@mantine/form` |
| Auth | `jose` (HS256 access + refresh JWTs), `bcryptjs` | Bearer token from the auth store |
| UI | — | Mantine 9, Tabler icons, `motion` |
| Jobs / integrations | node-cron, BullMQ (optional Redis), pdf-lib, Steadfast, SSL Wireless, Resend | — |
| Tooling | TypeScript (strict), `bun test`, drizzle-kit | TypeScript (strict), oxlint |

## Repository layout

```
.
├── backend/              Bun + Hono API (independent project, own bun.lock)
│   ├── src/              routes, services, db (schema, seed), migrations, middleware, lib, jobs
│   ├── scripts/          test-db.ts — throwaway local Postgres for the test-suite
│   ├── .env.example      environment template (copy to .env)
│   ├── .env.test         secret-free test environment (committed)
│   └── Dockerfile
├── frontend/             Next.js storefront + back-office (independent project, own bun.lock)
│   ├── app/              routes (storefront pages, /admin/*)
│   ├── components/       composite UI built on Mantine primitives
│   ├── hooks/ lib/       SWR hooks, API client, Zustand stores
│   ├── tokens/ theme.ts  design tokens and the Mantine theme
│   └── Dockerfile
├── context/              specification, phase blueprints, agent rules
├── plans/                implementation plans
├── docs/                 operational docs (deployment)
├── .github/              CI workflow and Dependabot
└── docker-compose.yml    single-host stack: redis + backend + frontend (+ migrate, test-db)
```

There is deliberately **no monorepo tooling** (no workspaces, Turborepo or shared `packages/`): install and run each folder on its own.

## Prerequisites

- **Bun 1.4.x** — `bun --version`
- **Node.js ≥ 20.9** (Node 24 LTS recommended) — `next build` / `next start` run on Node
- A **Supabase** project (PostgreSQL 15+; this deployment uses project `trhxoqxbngqpexrhfvrh` in `ap-southeast-1`)
- **PostgreSQL client binaries** (`initdb`, `pg_ctl`) to run the backend tests locally — or Docker for the `test-db` compose service
- Optional: Docker with Compose v2, Redis 7

## Quick start

```bash
# 1. Install dependencies (each folder separately)
cd backend  && bun install && cd ..
cd frontend && bun install && cd ..

# 2. Environment
cp backend/.env.example backend/.env           # then edit backend/.env
cp frontend/.env.example frontend/.env.local   # NEXT_PUBLIC_API_URL=http://localhost:4000
```

Fill in `backend/.env`:

- `DATABASE_URL` — Supabase **transaction pooler** (port `6543`), used by the API at runtime.
- `DIRECT_URL` — Supabase **session pooler** (port `5432`), used by migrations.
- `JWT_SECRET` — `openssl rand -hex 64`.

Copy both connection strings from **Supabase Dashboard → Connect** (pooler hosts are IPv4). For this project the host is `aws-0-ap-southeast-1.pooler.supabase.com`; the `aws-N-` prefix differs between projects, so always copy it from the dashboard. URL-encode special characters in the password (`@` → `%40`).

```bash
# 3. Database schema and demo data
cd backend
bun run db:migrate     # applies src/migrations via DIRECT_URL
bun run db:seed        # idempotent: categories, products, batches, discounts, dev accounts

# 4. Run (two terminals)
bun run dev                        # backend  → http://localhost:4000  (GET /health)
cd ../frontend && bun run dev      # frontend → http://localhost:3000  (/admin for the back-office)
```

## Seeded development accounts

`bun run db:seed` creates these accounts **only when `NODE_ENV` is not `production`** (in production only the super admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` is created):

| Email | Role | Password |
|---|---|---|
| `admin@myoxygen.com` | `SUPER_ADMIN` | `Admin@MyOxygen2026` (default when `SEED_ADMIN_*` is unset) |
| `inventory@myoxygen.com` | `INVENTORY_MANAGER` | `Staff@MyOxygen2026` |
| `orders@myoxygen.com` | `ORDER_MANAGER` | `Staff@MyOxygen2026` |
| `marketing@myoxygen.com` | `MARKETING_MANAGER` | `Staff@MyOxygen2026` |
| `support@myoxygen.com` | `SUPPORT_STAFF` | `Staff@MyOxygen2026` |
| `customer@myoxygen.com` | `CUSTOMER` | `Staff@MyOxygen2026` |

> **Development only.** These passwords are public (they are in this repository). Never seed them into a production database; if they already exist there, deactivate them or rotate their passwords before go-live (see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).

## Testing

The backend test-suite mutates data, so it **only ever runs against a local database**: `bun test` loads `backend/.env.test` (localhost:54329), and both the test preload (`src/tests/setup.ts`) and the DB client refuse any non-local host.

```bash
cd backend
bun run test          # starts/prepares the throwaway cluster, migrates, seeds, then `bun test`
bun run test:db:down  # stop the cluster when done
bun run test:db:reset # drop + recreate + migrate + seed
```

`scripts/test-db.ts` manages a private cluster in `backend/.testdb/` (git-ignored) using the PostgreSQL binaries it finds via `PG_BIN`, `PATH`, or the default install folders. To use an already running local Postgres instead (CI does this with a service container), set `TEST_DATABASE_URL`:

```bash
docker compose up -d test-db   # postgres:17 on 127.0.0.1:54329, tmpfs, trust auth
TEST_DATABASE_URL=postgresql://postgres@localhost:54329/my_oxygen_test bun run test
```

Frontend checks: `bun run typecheck`, `bun run lint`, `bun run build` in `frontend/`.

## Useful scripts

**Backend** (`cd backend`)

| Script | What it does |
|---|---|
| `bun run dev` | API with hot reload on `:4000` |
| `bun run start` | API without reload (production entrypoint) |
| `bun run typecheck` | `tsc --noEmit` (alias: `bun run build`) |
| `bun run test` | prepare the local test DB, then the full `bun test` suite |
| `bun run test:db:up` / `:down` / `:reset` | manage the throwaway test cluster (`--no-seed` to skip seeding) |
| `bun run db:generate` | generate a SQL migration from `src/db/schema/*.ts` |
| `bun run db:migrate` | apply pending migrations (uses `DIRECT_URL`) |
| `bun run db:check` | verify migration snapshots are consistent |
| `bun run db:seed` | idempotent seed (dev accounts only outside production) |
| `bun run db:studio` | Drizzle Studio |

**Frontend** (`cd frontend`)

| Script | What it does |
|---|---|
| `bun run dev` | Next.js dev server on `:3000` |
| `bun run build` | production build (standalone) + copies `public/` and static assets into `.next/standalone` |
| `bun run start` | run the standalone server (`node .next/standalone/server.js`) |
| `bun run start:next` | `next start` |
| `bun run typecheck` | `next typegen` + `tsc --noEmit` |
| `bun run lint` | oxlint |

## Environment variables

### Backend (`backend/.env`)

Validated at startup by [`backend/src/env.ts`](backend/src/env.ts): the API refuses to boot and lists every problem (values are never printed). Empty values count as "not set".

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `production` | `development` \| `production` \| `test`. Unset means production (fails closed); set `development` in your local `backend/.env`. Production enables the stricter checks below. |
| `PORT` | no | `4000` | HTTP port (1–65535). |
| `CORS_ORIGIN` | no | `http://localhost:3000` | Comma-separated allowed browser origins. `*` is rejected in production. |
| `TRUST_PROXY` | no | `false` | Read the client IP from `X-Forwarded-For` (rate limiting). Enable **only** behind a reverse proxy that sets it. |
| `APP_TIMEZONE` | no | `Asia/Dhaka` | IANA zone for business dates (expiry checks, nightly jobs). |
| `FRONTEND_URL` | no | — | Public storefront URL used in emails / links. |
| `DATABASE_URL` | **yes** | — | Postgres URL for the API. Supabase transaction pooler, port `6543`. |
| `DIRECT_URL` | no | `DATABASE_URL` | Postgres URL for migrations / drizzle-kit. Supabase session pooler, port `5432`. |
| `DB_POOL_MAX` | no | `10` | Max connections in the API pool (1–100). |
| `JWT_SECRET` | **yes** | — | HS256 signing key. ≥ 32 chars; ≥ 64 chars in production. `openssl rand -hex 64`. |
| `REDIS_URL` | no | — | Redis for BullMQ queues. Without it background work runs in-process. |
| `COURIER_PROVIDER` | no | `steadfast` | `steadfast` \| `mock`. |
| `STEADFAST_API_KEY` | no | — | Steadfast credentials; without both keys the adapter runs in sandbox/mock mode. |
| `STEADFAST_SECRET_KEY` | no | — | See above. |
| `STEADFAST_BASE_URL` | no | `https://portal.steadfast.com.bd/api/v1` | Steadfast API base URL. |
| `SSL_WIRELESS_API_TOKEN` | no | — | SSL Wireless SMS token; without token + SID SMS is mocked. |
| `SSL_WIRELESS_SID` | no | — | Approved sender ID. |
| `SSL_WIRELESS_BASE_URL` | no | `https://smsplus.sslwireless.com/api/v3/send-sms` | SMS endpoint. |
| `RESEND_API_KEY` | no | — | Resend key for transactional email; without it email is mocked. |
| `EMAIL_FROM` | no | — | Sender, e.g. `My Oxygen <orders@your-domain.com>`. |
| `ADMIN_ALERT_EMAIL` | no | — | Receives operational alerts (low stock, failed jobs). Must be an email. |
| `SEED_ADMIN_EMAIL` | prod seed | `admin@myoxygen.com` outside production | Super admin created by `db:seed`. **Required** when seeding with `NODE_ENV=production`. |
| `SEED_ADMIN_PASSWORD` | prod seed | documented dev password outside production | ≥ 12 chars. **Required** when seeding with `NODE_ENV=production`. |
| `SEED_DEMO_CATALOG` | no | `true` outside production, `false` in production | Seed demo products, batches, flash sales and coupons. A production seed without it creates only categories + the super admin. |

Test tooling only (not read by the API): `TEST_DATABASE_URL` (use an existing local Postgres instead of the managed cluster) and `PG_BIN` (directory containing `initdb` / `pg_ctl`).

### Frontend (`frontend/.env.local`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes (builds) | `http://localhost:4000` (client fallback) | Browser-facing API origin. Inlined at **build** time: rebuild after changing it. |

## Docker

```bash
cp backend/.env.example backend/.env            # production values; JWT_SECRET >= 64 chars
export NEXT_PUBLIC_API_URL=http://localhost:4000 # browser-facing API origin, baked into the image
docker compose build
docker compose run --rm migrate                  # apply migrations (explicit step)
docker compose up -d                             # redis + backend :4000 + frontend :3000
docker compose ps                                # all services should become "healthy"
```

- Images: multi-stage, non-root, `HEALTHCHECK` built in, no `.env` file copied. The backend build fails on type errors; the frontend build fails if `NEXT_PUBLIC_API_URL` is missing.
- Containers always run with `NODE_ENV=production`; seeding then requires `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`: `docker compose run --rm migrate bun run db:seed`.
- Invoice PDFs persist in the `backend_uploads` volume; Redis data in `redis_data`.

Production rollout, backups and rollback: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request and on pushes to `main`:

- **backend** — `bun install --frozen-lockfile`, typecheck, `db:check`, schema-drift check (schema changed without a migration fails the build), `db:migrate` against a `postgres:17` service container, then `bun run test` (seed + full suite).
- **frontend** — typecheck, lint, production build.
- **docker** — builds the backend, migrator and frontend images (no push) once both jobs pass.

Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)) proposes weekly updates for both Bun projects and the pinned GitHub Actions.

## Security notes

- **Never commit `.env` files.** Only `*.env.example` templates and the secret-free `backend/.env.test` are tracked; `.gitignore` enforces this. Use a secret manager or the deploy platform's env settings in production.
- Credentials of the **previous** Supabase project were committed to git history and must be treated as compromised (see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#compromised-credentials)).
- The seeded dev accounts use public passwords: deactivate or rotate them before production, and seed production only with `SEED_ADMIN_*`.
- `JWT_SECRET` must be ≥ 64 random characters in production; rotating it signs everyone out.
- Set `TRUST_PROXY=true` **only** when exactly one reverse proxy sits in front of the API. The limiter then uses the right-most `X-Forwarded-For` entry (the address the proxy saw), so client-supplied entries can't bypass it. Without a proxy, keep it `false`.
- `CORS_ORIGIN` must list exact origins in production (`*` is rejected).
- RLS is enabled on all tables without policies; any new table must also `ENABLE ROW LEVEL SECURITY` in its migration.
- Unknown errors return a generic `INTERNAL_ERROR`; internal messages are only exposed when `NODE_ENV=development`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ENOTFOUND` / `ENETUNREACH` connecting to `db.<ref>.supabase.co` | The direct host is IPv6-only on many networks. Use the Supavisor pooler hosts from Dashboard → Connect (IPv4). |
| `Tenant or user not found` | Wrong pooler host prefix (`aws-0-` vs `aws-1-`) or username. The user must be `postgres.<project-ref>`; copy the host from the dashboard. |
| `password authentication failed` / `Invalid URL` | URL-encode special characters in the password: `@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`. |
| API exits with `Invalid environment configuration` | Read the listed variables; compare with `backend/.env.example`. |
| `prepared statement … already exists` (other tools) | Named prepared statements do not work through the transaction pooler (`:6543`). The API (node-postgres) only uses unnamed statements; for other clients disable prepared statements or connect through the session pooler (`:5432`). |
| Tests: `PostgreSQL binaries (initdb, pg_ctl) not found` | Install PostgreSQL or point `PG_BIN` at its `bin` folder. Windows (Git Bash): `export PG_BIN="C:/Program Files/PostgreSQL/17/bin"`; PowerShell: `$env:PG_BIN = "C:\Program Files\PostgreSQL\17\bin"`. Or use `docker compose up -d test-db` + `TEST_DATABASE_URL`. |
| Tests: `Refusing to connect: NODE_ENV is "test" but the database host is …` | Working as intended: tests only run against localhost. Check `backend/.env.test` / `TEST_DATABASE_URL`. |
| Tests: port `54329` in use | `bun run test:db:down`, or stop whatever else listens on it. |
| Frontend calls `localhost:4000` in production | `NEXT_PUBLIC_API_URL` was not set at build time. Rebuild with the right value. |
| Browser `CORS` errors | Add the exact storefront origin (scheme + host + port) to `CORS_ORIGIN`. |

## Further documentation

- [`backend/README.md`](backend/README.md) — API conventions, error codes, RBAC, migrations, jobs, endpoints
- [`frontend/README.md`](frontend/README.md) — frontend stack, design tokens, conventions
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production checklist, backups, rollback
- [`context/SPECIFICATION.md`](context/SPECIFICATION.md), [`context/RULES.md`](context/RULES.md) — product specification and engineering rules
