# Deployment Guide

How to run My Oxygen in production: configuration, database, containers, verification and rollback. Local setup is in the [root README](../README.md).

## Contents

- [Compromised credentials](#compromised-credentials) — read first
- [Current production: Railway + Vercel](#current-production-railway--vercel)
- [Target topology](#target-topology)
- [Production checklist](#production-checklist)
- [Configuration reference](#configuration-reference)
- [Database: migrations, seed, dev accounts](#database-migrations-seed-dev-accounts)
- [Supabase: backups and hardening](#supabase-backups-and-hardening)
- [Redis and background jobs](#redis-and-background-jobs)
- [Reverse proxy and TRUST_PROXY](#reverse-proxy-and-trust_proxy)
- [Release procedure](#release-procedure)
- [Health checks, logs and monitoring](#health-checks-logs-and-monitoring)
- [Rollback](#rollback)
- [Secret rotation](#secret-rotation)

---

## Compromised credentials

Real environment files (`backend/.env`, `frontend/.env`, `frontend/.env.local`) were committed to this repository from the initial commit until the audit remediation removed them from the index. **Deleting them from the working tree does not remove them from git history**: anyone with a clone can still read them.

Treat every value that was ever in those files as compromised:

1. **The previous Supabase project** — its database password and connection strings are public. Do not reuse that project for production: reset its database password (Dashboard → Project Settings → Database) and pause or delete it once data has been migrated. Review its logs for connections you do not recognise.
2. **`JWT_SECRET`** — generate a new one (`openssl rand -hex 64`) for every environment. Any token signed with the old secret could be forged.
3. **Third-party keys** — if Steadfast, SSL Wireless or Resend credentials were ever placed in those files, revoke and reissue them in each provider's dashboard.
4. **Dev account passwords** — the seeded passwords are public by design; see [dev accounts](#deactivate-development-accounts).

Rotation is the fix; history rewriting is optional hygiene. If you also want the files gone from history (e.g. before making the repository public), rewrite it with `git filter-repo --invert-paths --path backend/.env --path frontend/.env --path frontend/.env.local`, force-push, and have every collaborator re-clone. Do this only after rotating — a rewrite cannot un-leak a value.

## Current production: Railway + Vercel

Production has run on Railway (API) and Vercel (website) since 10 November 2026. Both deploy automatically from `main`.

| Part | Where | Settings |
|---|---|---|
| API | Railway, project `my-oxygen`, service `backend` (client's account), region Singapore (`asia-southeast1`) | Root directory `/backend`, built from `backend/Dockerfile`, healthcheck `/health` (120 s), restart on failure (10 retries), 1 replica, watch path `/backend/**` |
| Website | Vercel, project `my-oxygen-web` | Root directory `frontend`, Next.js preset. `www.myoxygen.life`; `myoxygen.life` redirects to `www` |
| Database | Supabase `trhxoqxbngqpexrhfvrh`, Singapore | The API uses the transaction pooler (`:6543`) |

**Deploys.** A push to `main` rebuilds the website every time. It rebuilds the API only when something under `backend/` changed. `main` is production: never push unfinished work there.

**Railway variables** (service `backend`):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` (the Railway domains target this port) |
| `TRUST_PROXY` | `true` (Railway's edge proxy sits in front of the API) |
| `CLIENT_IP_HEADER` | `x-real-ip`. Railway's edge overwrites `X-Real-IP` with the client address. The right-most `X-Forwarded-For` entry there is one of Railway's own proxy hops: with the default the login rate limit never triggered. |
| `APP_TIMEZONE` | `Asia/Dhaka` |
| `CORS_ORIGIN` | `https://www.myoxygen.life,https://myoxygen.life,https://my-oxygen-web.vercel.app` |
| `FRONTEND_URL` | `https://www.myoxygen.life` |
| `DATABASE_URL` | Supabase transaction pooler URL (secret) |
| `JWT_SECRET` | 88 random characters, generated for production only (secret) |

Not set yet:
- `REDIS_URL`: not safe to set yet, see [Redis](#redis-and-background-jobs).
- `DIRECT_URL`: only migrations need it.
- Courier, SMS and email keys: add them when the client provides them.

**Vercel variables:** `NEXT_PUBLIC_API_URL` (Production and Preview) is the API origin. Next.js inlines it at build time, so redeploy after changing it.

**Migrations.** The runtime image does not include drizzle-kit. Before pushing code that needs a new migration, run it from a development machine (`cd backend && bun run db:migrate`, with `DIRECT_URL` pointing at production).

**API domain `api.myoxygen.life`** (live since 13 November 2026). The website calls `https://api.myoxygen.life`. The `myoxygen.life` DNS is hosted by Vercel and has two records for it:

| Type | Name | Value |
|---|---|---|
| `CNAME` | `api` | `9vdbpqn3.up.railway.app` (Railway's target for this domain) |
| `TXT` | `_railway-verify.api` | the `railway-verify=…` token shown in Railway → `backend` → Settings → Networking |

Railway issues and renews the Let's Encrypt certificate. The domain's CAA records already allow `letsencrypt.org`. Keep both DNS records: deleting the TXT record can stop renewals. The Railway URL `https://backend-production-f0954.up.railway.app` still works, but do not use it in the website (see Russia below).

**Visitors in Russia.** Tested on 13 November 2026 from two check-host.net servers in Moscow (data centres, not home or mobile networks):
- The website on Vercel loads normally.
- The Railway URL (`backend-production-f0954.up.railway.app`, IP `153.52.255.67`) times out: TCP connects, then the HTTPS request hangs.
- `api.myoxygen.life` (Railway target IP `153.52.255.66`) answered every test in 0.3–0.8 s.

Russian filtering changes often. Re-test from Russian nodes after changing domains or hosting, and if Russian visitors report problems: `https://check-host.net/check-http?host=https://api.myoxygen.life/health`. If the API domain is blocked one day, the fallback is to proxy the API through the website's own domain (`www.myoxygen.life/api/…`). That proxy must pass the real client IP to the rate limiter.

**Known gotchas**
- Railway rejects BuildKit cache mounts whose id lacks its service id ("Cache mount ID is not prefixed with cache key"), so the Dockerfile uses none.
- With Railway CLI 5.71, `railway environment edit --service-config …` reported "No changes to apply" for service settings. Use the dashboard or the GraphQL `serviceInstanceUpdate` mutation instead.
- Railway's builder setting shows `RAILPACK`, but Railway builds with the `Dockerfile` it finds in the root directory.
- Vercel preview deployments are not in `CORS_ORIGIN`, so their API calls fail. Production is unaffected.
- **Plans:** the Railway account is on the trial plan. Upgrade it to a paid plan before the trial ends, or the API stops. The Vercel team is on Hobby, which Vercel limits to non-commercial use, so a live store needs Pro.

## Target topology

```
Internet ──TLS──► reverse proxy / load balancer (Caddy, Nginx, Traefik, cloud LB)
                    ├─ www.<domain>  → frontend container :3000 (Next.js standalone)
                    └─ api.<domain>  → backend  container :4000 (Bun + Hono)
                                          ├─ Supabase Postgres (Supavisor pooler, TLS)
                                          │    :6543 transaction — API runtime (DATABASE_URL)
                                          │    :5432 session     — migrations (DIRECT_URL)
                                          ├─ Redis 7 (private network)
                                          └─ Steadfast · SSL Wireless · Resend (HTTPS)
```

- Only the proxy is reachable from the internet; ports 3000/4000 and Redis stay on the private network.
- The browser calls the API origin directly (CORS), so the API needs its own public hostname (or a path on the same origin routed by the proxy).
- [`docker-compose.yml`](../docker-compose.yml) runs the same images on a single host; put the proxy in front of it.

## Production checklist

**Before the first deploy**

- [ ] New Supabase project (not the compromised one); database password generated, never committed.
- [ ] `backend` environment set in the platform's secret store (not a file in the repo), with:
  - [ ] `NODE_ENV=production`
  - [ ] `DATABASE_URL` → transaction pooler `:6543`; `DIRECT_URL` → session pooler `:5432` (hosts copied from Dashboard → Connect; passwords URL-encoded)
  - [ ] `JWT_SECRET` — ≥ 64 random characters, unique per environment (the API refuses to start with less)
  - [ ] `CORS_ORIGIN` — exact storefront origin(s), e.g. `https://www.myoxygen.com.bd`; never `*` (rejected)
  - [ ] `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (≥ 12 chars) — required for seeding in production
  - [ ] `TRUST_PROXY=true` **only** when exactly one reverse proxy sits in front of the API (see [below](#reverse-proxy-and-trust_proxy))
  - [ ] `FRONTEND_URL`, `EMAIL_FROM`, `ADMIN_ALERT_EMAIL`
  - [ ] `COURIER_PROVIDER=steadfast` with `STEADFAST_API_KEY` / `STEADFAST_SECRET_KEY`; `SSL_WIRELESS_*`; `RESEND_API_KEY` — without credentials each integration silently runs in **mock** mode
  - [ ] `REDIS_URL` (private Redis, password/TLS when managed)
  - [ ] `DB_POOL_MAX` sized so `instances × DB_POOL_MAX` stays below the Supavisor pool size of the compute tier
- [ ] Frontend image built with `--build-arg NEXT_PUBLIC_API_URL=https://api.<domain>` (baked in at build time).
- [ ] Migrations applied ([below](#run-migrations)); `pg_trgm` present in schema `extensions` (migration 0001 creates it).
- [ ] Super admin seeded with `SEED_ADMIN_*`; dev accounts absent or deactivated.
- [ ] Supabase backups/PITR configured and a restore tested.
- [ ] TLS on the proxy, HTTP → HTTPS redirect; only the proxy is public.
- [ ] Health checks wired to `/health` (API) and `/` (frontend).
- [ ] Logs shipped off-host; alerting on 5xx rate and `/health` failures.
- [ ] Rollback path rehearsed (previous image tags kept).

**Every release**

- [ ] CI green on the commit being released (typecheck, drift check, migrations, tests, lint, builds, Docker images).
- [ ] New migrations reviewed and backward compatible with the running version ([expand/contract](#rollback)).
- [ ] Migrate → deploy backend → verify `/health` → deploy frontend → smoke tests.

## Configuration reference

The authoritative list with defaults is the environment table in the [root README](../README.md#environment-variables) and [`backend/.env.example`](../backend/.env.example). `backend/src/env.ts` validates everything at boot and refuses to start with a list of problems (never echoing values). Production-only rules enforced there: `JWT_SECRET` ≥ 64 characters, `CORS_ORIGIN` without `*`.

## Database: migrations, seed, dev accounts

### Run migrations

Migrations are forward-only SQL files in `backend/src/migrations`, applied by drizzle-kit over `DIRECT_URL` and tracked in `drizzle.__drizzle_migrations`. Run them as an explicit release step **before** the new backend version starts — never automatically on container boot (several replicas would race) and never with `drizzle-kit push`.

```bash
# With Docker (uses backend/.env or the env you pass in)
docker compose run --rm migrate
# or the migrator image directly
docker build --target migrator -t my-oxygen-migrator ./backend
docker run --rm --env-file /secure/path/backend.env my-oxygen-migrator

# Without Docker
cd backend && bun install --frozen-lockfile && bun run db:migrate
```

### Seed

```bash
docker compose run --rm migrate bun run db:seed     # or: cd backend && bun run db:seed
```

With `NODE_ENV=production` the seed requires `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, creates **only** that super admin (no dev accounts) and is idempotent (re-running updates the admin's password hash only if it changed).

> In production the seed creates only the 4 categories and the super admin. The **demo catalog** (demo products, batches with IMPORT ledger rows, flash sales and coupons) is seeded only when `SEED_DEMO_CATALOG=true`; outside production it is seeded by default. Re-running with the demo catalog resets catalog fields of the seed-owned products.

### Deactivate development accounts

If the production database was ever seeded with `NODE_ENV` other than `production` (for example because it was also used for development), the public dev accounts exist. Deactivate them (deactivation takes effect immediately; `requireAuth` checks `is_active` on every request):

```sql
UPDATE users
SET    is_active = false
WHERE  email IN ('inventory@myoxygen.com', 'orders@myoxygen.com', 'marketing@myoxygen.com',
                 'support@myoxygen.com', 'customer@myoxygen.com');
```

If the super admin is still `admin@myoxygen.com` with the documented password, either re-run the seed with `SEED_ADMIN_EMAIL=admin@myoxygen.com` and a new `SEED_ADMIN_PASSWORD` (rotates the hash), or create your real admin via `SEED_ADMIN_*` and deactivate `admin@myoxygen.com` the same way.

## Supabase: backups and hardening

- **Backups** — daily backups are included on paid plans; enable **Point-in-Time Recovery** (add-on) for a recovery point of minutes instead of a day. Note the retention window and **test a restore** (restore into a new project, point a staging backend at it).
- Before risky migrations take an extra logical backup over the session pooler: `pg_dump "$DIRECT_URL" --format=custom --file=pre-<release>.dump`.
- **Network** — enable network restrictions (allow-list the backend's egress IPs) and SSL enforcement (Dashboard → Database settings).
- **Data API** — the app does not use PostgREST. RLS is enabled on every table with no policies, so `anon`/`authenticated` see nothing; you can additionally disable the Data API or remove `public` from its exposed schemas. Every new table must enable RLS in its migration.
- **Roles** — the API connects as the table owner (bypasses RLS). Keep that password only in the secret store.
- **Connection limits** — the API uses the transaction pooler; size `DB_POOL_MAX` per instance against the pool size of your compute tier.

## Redis and background jobs

- With `REDIS_URL` set, order notifications, invoice generation and the daily inventory digest run on a **BullMQ** queue (worker inside the API process, retries with exponential backoff). Without it the API falls back to an **in-process** queue with the same retry policy, which loses pending jobs on restart. The nightly expiry scan runs on node-cron at 02:00 `APP_TIMEZONE`.
- ⚠️ **Do not set `REDIS_URL` yet.** BullMQ 6 does not bundle a Redis client, and `ioredis` is not installed. With `REDIS_URL` set, BullMQ throws "could not load the optional 'ioredis' package" and no job runs. To enable Redis:
  1. Run `bun add ioredis`.
  2. On Railway, append `?family=0` to the private Redis URL (`*.railway.internal` can resolve to IPv6 only).
  3. Test against a real Redis: place an order, then check that the invoice and notifications run.
- Compose already provides `redis:7-alpine` with AOF persistence and `maxmemory-policy noeviction` (required by BullMQ: evicted keys mean lost jobs).
- Managed Redis: use `rediss://` (TLS) with a password, private networking only.
- **Run a single backend instance** until the in-memory pieces move to Redis: the rate limiter, the response cache and the cron scheduler are per-process, so N replicas give N× the auth rate limit and run the nightly job N times.
- The nightly expiry scan runs at 02:00 in `APP_TIMEZONE` (default Asia/Dhaka) regardless of the container's clock, and the inventory digest email at 08:00 in the same zone.

## Reverse proxy and TRUST_PROXY

The rate limiter keys on the client IP. With `TRUST_PROXY=true` it takes the **right-most** `X-Forwarded-For` entry (falling back to `X-Real-IP`): the address your proxy observed. Entries to its left come from the client and are ignored, so the setup is safe whether the proxy overwrites the header (`$remote_addr`, shown below) or appends to it (`$proxy_add_x_forwarded_for`). This assumes exactly **one** trusted proxy in front of the API. Without a proxy, keep `TRUST_PROXY=false`.

Platforms whose edge overwrites a dedicated header instead: set `CLIENT_IP_HEADER` to that header and the limiter reads only it. On **Railway** use `CLIENT_IP_HEADER=x-real-ip`. With the default, 34 failed logins in two minutes were never limited, because the right-most `X-Forwarded-For` entry is one of Railway's own proxy hops. After a change, check from outside that the 16th failed login within a minute returns `429`, with and without a spoofed `X-Forwarded-For`.

Nginx example:

```nginx
server {
    listen 443 ssl http2;
    server_name api.myoxygen.com.bd;
    # ssl_certificate / ssl_certificate_key ...

    client_max_body_size 5m;

    location / {
        proxy_pass         http://backend:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $remote_addr;   # overwrite with the real peer address
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
```

If the proxy itself sits behind a CDN/LB, configure it to derive the real client IP from that hop first (e.g. `real_ip_header` + `set_real_ip_from` in Nginx) and then overwrite the header as above.

Other proxy duties: TLS termination and HTTP → HTTPS redirect, HSTS (the API already sends it), compression for the frontend, and never exposing ports 3000/4000 directly.

## Release procedure

```bash
SHA=$(git rev-parse --short HEAD)

# 1. Build immutable, SHA-tagged images (CI already proved they build)
docker build -t registry.example.com/my-oxygen-backend:$SHA  ./backend
docker build --target migrator -t registry.example.com/my-oxygen-migrator:$SHA ./backend
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.myoxygen.com.bd \
             -t registry.example.com/my-oxygen-frontend:$SHA ./frontend
docker push registry.example.com/my-oxygen-backend:$SHA   # ...and the other two

# 2. Migrate (backward-compatible migrations only)
docker run --rm --env-file /secure/backend.env registry.example.com/my-oxygen-migrator:$SHA

# 3. Roll out backend, wait for healthy, then frontend
# 4. Smoke tests
curl -fsS https://api.myoxygen.com.bd/health
curl -fsS https://api.myoxygen.com.bd/catalog/categories | head -c 300
curl -fsS "https://api.myoxygen.com.bd/catalog/products?limit=3" | head -c 300
curl -fsS -o /dev/null -w '%{http_code}\n' https://www.myoxygen.com.bd/
curl -sI -H 'Origin: https://evil.example' https://api.myoxygen.com.bd/health | grep -i access-control || echo "CORS locked"
```

Then log in to `/admin` with the real super admin and place a test order end to end (courier sandbox off only when intended).

## Health checks, logs and monitoring

| Probe | Endpoint | Healthy | Notes |
|---|---|---|---|
| API | `GET /health` | `200 {"status":"UP","database":"CONNECTED",…}` | Deep check (runs `SELECT 1`); returns `503` when the DB is unreachable. Docker `HEALTHCHECK` every 30 s. |
| Frontend | `GET /` | `200` | Docker `HEALTHCHECK` every 30 s. |

- Because `/health` is a deep check, a database outage marks every API instance unhealthy at once; configure the orchestrator to stop routing traffic rather than restart-loop indefinitely, and alert on it.
- **Logs** — the API writes request lines (Hono logger) and structured JSON events (`server_started`, `shutdown_*`, `db_pool_idle_client_error`, `health_check_db_failed`, unhandled errors with `requestId`) to stdout/stderr. Compose rotates container logs (json-file, 5 × 10 MB); ship them to an aggregator (Loki, CloudWatch, Datadog, …). Every response carries `X-Request-Id` for correlation.
- Secrets are never logged: env validation reports variable names only, and unknown errors return a generic message to clients.
- Alert on: `/health` failures, 5xx rate, `RATE_LIMITED` spikes, `expiry_scan_error`, Supabase CPU/connection saturation.
- Graceful shutdown: on `SIGTERM` the API stops background jobs, drains in-flight requests and closes the pool (hard deadline 10 s); give containers ≥ 15 s stop grace (compose does).

## Rollback

**Application** — redeploy the previous image tag for backend and/or frontend (keep at least the last few tags in the registry). The frontend is stateless; the backend is stateless except for `uploads/` (invoice PDFs in a volume).

**Database** — migrations are forward-only (drizzle-kit has no down migrations), so make every migration safe for the *previous* app version (expand/contract):

1. *Expand*: add nullable columns/tables/indexes; backfill; deploy code that writes both shapes.
2. *Contract*: drop/rename old columns in a **later** release, once no running version reads them.

With that discipline an application rollback never needs a schema rollback. If a migration itself was destructive or wrong:

- write and apply a new corrective migration (preferred), or
- restore data from the pre-migration `pg_dump`, or
- use Supabase PITR to a timestamp just before the migration (restores the whole database — coordinate downtime; orders placed after that point are lost unless exported first).

## Secret rotation

| Secret | Procedure | Impact |
|---|---|---|
| `JWT_SECRET` | Generate (`openssl rand -hex 64`), update the secret store, restart the API | All sessions invalidated; users log in again |
| Database password | Reset in Supabase, update `DATABASE_URL` + `DIRECT_URL`, restart API | Brief connection errors during restart |
| Integration keys | Reissue in the provider dashboard, update env, restart | None if done in one step |
| Admin password | Re-run the seed with a new `SEED_ADMIN_PASSWORD` | Admin logs in again |
