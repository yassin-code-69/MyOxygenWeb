# My Oxygen — Backend API

Bun + Hono REST API for the My Oxygen storefront and back-office: catalog and fuzzy search, FEFO batch inventory, checkout, orders and courier dispatch, PDF invoices, notifications and RBAC-protected admin operations. Data lives in Supabase PostgreSQL, accessed through Drizzle ORM.

Setup, environment variables and dev accounts are documented in the [root README](../README.md); production rollout in [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

```bash
bun install
cp .env.example .env      # DATABASE_URL, DIRECT_URL, JWT_SECRET
bun run db:migrate && bun run db:seed
bun run dev               # http://localhost:4000/health
```

---

## Project structure

```
backend/
├── src/
│   ├── index.ts              app assembly: global middleware, route mounting, graceful shutdown
│   ├── env.ts                typed, validated environment (import `env`, never `process.env`)
│   ├── db/
│   │   ├── client.ts         pg Pool + Drizzle instance, `closeDb()`
│   │   ├── connection.ts     TLS/SSL helpers and the local-only test guard (no `env` import)
│   │   ├── schema/           enums.ts, tables.ts — source of truth for migrations
│   │   └── seed.ts           idempotent seed (`bun run db:seed`)
│   ├── migrations/           drizzle-kit SQL migrations + meta/ journal and snapshots
│   ├── routes/               HTTP layer: params, Zod validation, auth, response helpers
│   │   └── *.schema.ts       request schemas per route module
│   ├── services/             business rules (inventory/FEFO, orders, coupons, courier, invoice, notification)
│   ├── middleware/           auth/RBAC, error handler, rate limiter, response cache, security headers
│   ├── lib/                  errors, http envelope helpers, validation, jwt, rbac, dates, db-errors
│   ├── jobs/                 background work (nightly expiry scan) started from index.ts
│   ├── types/                DTOs and API envelope types
│   └── tests/                test preload (local-DB guard) and cross-cutting tests
├── scripts/test-db.ts        throwaway local Postgres for tests
├── drizzle.config.ts         drizzle-kit config (DIRECT_URL → DATABASE_URL)
├── bunfig.toml               `bun test` preload
├── .env.example / .env.test  env template / secret-free test env
└── Dockerfile                deps → typecheck → migrator | runtime
```

Layering rule: **routes** deal with HTTP only (params, validation, auth, response); **services** own business logic and transactions; no SQL or business computation in route handlers. Every mutation that touches stock runs inside `db.transaction(...)` with row locks.

## API conventions

### Response envelope

Every JSON response (except `GET /health`) uses one of two shapes:

```jsonc
// success — lib/http.ts: ok(), created(), paginated()
{ "success": true, "data": { /* ... */ }, "meta": { "page": 1, "limit": 20, "total": 57, "totalPages": 3 } }

// failure — thrown AppError, rendered by middleware/error-handler.ts
{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "Only 3 left", "details": { "available": 3 } } }
```

- `meta` is present on paginated lists only.
- `204 No Content` responses have no body.
- Code never builds error bodies by hand: services throw `AppError.<kind>(...)` (see `src/lib/errors.ts`) and the global handler renders them.
- `message` is always safe to show to end users; structured context goes in `details`. Unknown errors become a generic `500 INTERNAL_ERROR` (the real message is only exposed when `NODE_ENV=development`).

### Error codes

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Request body / query / params failed Zod validation. `details = { target, formErrors, fieldErrors }`. |
| `BAD_REQUEST` | 400 | Malformed request (e.g. invalid JSON), invalid value format, constraint violation. |
| `UNAUTHORIZED` | 401 | Missing, invalid or expired access token; inactive or deleted account. |
| `FORBIDDEN` | 403 | Authenticated but missing the required role/permission (`details.permission`). |
| `NOT_FOUND` | 404 | Unknown resource or route. |
| `CONFLICT` | 409 | Unique violation, record still referenced, concurrent modification (retry). |
| `INSUFFICIENT_STOCK` | 409 | Not enough unexpired stock to fulfil the request. |
| `INVALID_COUPON` | 422 | Coupon unknown, expired, exhausted or not applicable. |
| `INVALID_STATUS_TRANSITION` | 409 | Order status change not allowed (`details = { from, to }`). |
| `RATE_LIMITED` | 429 | Too many requests; `Retry-After` header and `details.retryAfterSeconds`. |
| `SERVICE_UNAVAILABLE` | 503 | Database unreachable, pool exhausted, statement timeout. |
| `INTERNAL_ERROR` | 500 | Anything unexpected (logged server-side with the request id). |

Postgres errors that bubble up are mapped automatically (`23505` → 409 `CONFLICT`, `23503` → 409/400, `23514`/`23502`/`22P02` → 400 `BAD_REQUEST`, `40001`/`40P01`/`55P03` → 409 `CONFLICT`, connection/timeouts → 503).

### Pagination

List endpoints accept `?page=` (≥ 1, default 1) and `?limit=` (1–100, default 20; see `paginationQuery` in `src/lib/validation.ts`) and return:

```json
"meta": { "page": 2, "limit": 20, "total": 57, "totalPages": 3 }
```

### Other conventions

- **Request ids** — every response carries `X-Request-Id`; include it when reporting errors.
- **Caching** — selected public catalog reads are cached in memory (`X-Cache: HIT|MISS`); all other responses are uncached.
- **Rate limiting** — `/auth/login`, `/auth/register`, `/auth/refresh`: 15 requests per minute per client IP (in-memory, per instance). The client IP comes from a proxy header only when `TRUST_PROXY=true`: the right-most `X-Forwarded-For` entry by default, or the header named in `CLIENT_IP_HEADER` (`x-real-ip` on Railway).
- **CORS** — origins from `CORS_ORIGIN`; credentials allowed unless the origin list is `*` (rejected in production).
- **Security headers** — strict CSP (`default-src 'none'`), `X-Frame-Options: DENY`, `nosniff`, HSTS, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Dates** — business dates (expiry, "today") are computed in `APP_TIMEZONE` (`Asia/Dhaka`), never the server's UTC clock.
- **Health** — `GET /health` pings the database and returns `{ status: "UP", database: "CONNECTED", latencyMs, uptime, timestamp }` (200) or `{ status: "DOWN", ... }` (503), outside the envelope, `Cache-Control: no-store`.

## Authentication & RBAC

- `POST /auth/login` returns an **access token** (15 min) and a **refresh token** (7 days); `POST /auth/refresh` exchanges a refresh token for a new access token.
- Tokens are HS256 JWTs (`jose`) signed with `JWT_SECRET`, issuer `my-oxygen-api`, audience `my-oxygen`, and a `tokenType` claim (`access` | `refresh`) — a refresh token is never accepted as an access token.
- Send `Authorization: Bearer <accessToken>`. `requireAuth` re-reads the user's **role and `isActive` from the database** on every request, so role changes and deactivation take effect immediately.
- `requirePermission(Permissions.X)` guards admin routes; `SUPER_ADMIN` passes every check.

Roles and permissions (`src/lib/rbac.ts`):

| Permission | SUPER_ADMIN | INVENTORY_MANAGER | ORDER_MANAGER | MARKETING_MANAGER | SUPPORT_STAFF | CUSTOMER |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `products:read` | ✓ | ✓ | | ✓ | ✓ | |
| `products:write` | ✓ | ✓ | | | | |
| `batches:manage` | ✓ | ✓ | | | | |
| `stock:adjust` | ✓ | ✓ | | | | |
| `orders:read` | ✓ | | ✓ | | ✓ | |
| `orders:status_update` | ✓ | | ✓ | | | |
| `courier:assign` | ✓ | | ✓ | | | |
| `invoice:generate` | ✓ | | ✓ | | | |
| `refunds:request` | ✓ | | | | ✓ | |
| `refunds:approve` | ✓ | | ✓ | | | |
| `discounts:manage` | ✓ | | | ✓ | | |
| `analytics:read` | ✓ | ✓ | ✓ | ✓ | | |
| `staff:manage` | ✓ | | | | | |

Customers have no staff permissions; customer-facing routes only require authentication and check ownership in the service layer (e.g. a customer can only read their own orders).

## Database & migrations

The schema in `src/db/schema/` is the source of truth; SQL migrations in `src/migrations/` are generated from it and **committed**.

```bash
# 1. Edit src/db/schema/tables.ts (or enums.ts)
# 2. Generate a migration
bun run db:generate --name add_wishlist
# 3. Review the generated SQL (and meta/ snapshot) — rename-vs-drop prompts, data backfills,
#    locking on large tables. Add hand-written SQL to the same migration when needed.
#    New tables must `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
# 4. Apply locally / to the target database
bun run db:migrate
bun run db:check          # snapshot consistency
```

Rules:

- **Never `drizzle-kit push`** against a shared or production database; only reviewed migrations are applied.
- Never edit a migration that has been applied anywhere; add a new one.
- The migration history was reset to a new `0000_baseline` on 2026-11-09 when the app moved to a new Supabase project. A database migrated with the old journal (`0000_glorious_lucky_pierre`) cannot be migrated forward: create a fresh database, run `db:migrate`, and copy data over if any is needed.
- Migrations run over `DIRECT_URL` (Supabase **session** pooler, `:5432`); the API uses `DATABASE_URL` (**transaction** pooler, `:6543`).
- Applied migrations are tracked in `drizzle.__drizzle_migrations`.
- `pg_trgm` lives in the `extensions` schema; call it schema-qualified (`extensions.similarity(...)`, `OPERATOR(extensions.%)`).
- CI fails when the schema changes without a migration (drift check) and runs every migration against a fresh `postgres:17`.

## Background jobs

| Job | Where it runs | Schedule |
|---|---|---|
| Expiry scan — zero out expired batches, write `EXPIRED_SCRAP` ledger rows | in-process (`node-cron`, `src/jobs/expiry-scheduler.ts`) | daily 02:00 ¹ |
| Order notifications (email + SMS) | in-process, fire-and-forget (`Promise.allSettled`) | on order events |

¹ The spec says 02:00 `Asia/Dhaka`. The cron task is currently registered without a `timezone` option, so it fires at 02:00 **server** time (UTC in Docker, i.e. 08:00 in Dhaka) until it passes `{ timezone: env.APP_TIMEZONE }`.

- `startBackgroundJobs()` runs only when the API is the main process (never in tests); `stopBackgroundJobs()` is awaited during graceful shutdown before the DB pool closes. Register new schedulers/workers in `src/jobs/index.ts`.
- `REDIS_URL` is reserved for BullMQ queues (Docker Compose provides Redis). Without it everything runs in-process, which is fine for a **single** API instance. Before running several replicas, move scheduled jobs, the rate limiter and the response cache to Redis (or run jobs on exactly one instance), otherwise each replica runs the cron and keeps its own counters.
- Integrations (Steadfast, SSL Wireless, Resend) fall back to mock mode when their credentials are not configured.

## Testing

```bash
bun run test                                  # prepare local test DB + full suite
bun test src/tests/inventory-concurrency.test.ts   # one file (DB must be up: bun run test:db:up)
bun run test:db:down
```

- `bun test` loads `.env.test` (NODE_ENV=test, `localhost:54329`); variables already set in the shell take precedence.
- `src/tests/setup.ts` (preload) and `src/db/client.ts` refuse any non-local database.
- `scripts/test-db.ts` manages a private cluster in `.testdb/`; set `TEST_DATABASE_URL` to use an existing local Postgres instead (CI, `docker compose up -d test-db`).

<!-- ENDPOINTS:START -->
## Endpoints

> Full request/response shapes, error codes and the order lifecycle are in [`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md). This table is the index. "auth" = `Authorization: Bearer <access token>`; permissions are listed by their RBAC key.

**Health & auth**

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/health` | public | Deep DB check: `UP`/`CONNECTED` or 503 `DOWN` |
| POST | `/auth/register` | public | Rate limited (15/min/IP) |
| POST | `/auth/login` | public | Rate limited; returns access + refresh tokens |
| POST | `/auth/refresh` | public | Rate limited; refresh token → new access token |
| GET | `/auth/me` | auth | Current user profile |

**Catalog (public, anonymous responses cached)**

| Method | Path | Notes |
|---|---|---|
| GET | `/catalog/categories` | Cached 300 s, ordered by `sort_order` |
| GET | `/catalog/products` | Search (`pg_trgm`), category/brand/price/stock filters on effective price, sort, facets, pagination |
| GET | `/catalog/products/:idOrSlug` | Detail + FEFO batch summary + related products |
| GET | `/catalog/flash-sales` | Cached 30 s, running automatic flash sales |

**Catalog & discount administration**

| Method | Path | Access |
|---|---|---|
| GET | `/admin/catalog/products` | `products:read` |
| GET | `/admin/catalog/products/:id` | `products:read` |
| POST | `/admin/catalog/products` | `products:write` |
| PATCH | `/admin/catalog/products/:id` | `products:write` |
| DELETE | `/admin/catalog/products/:id` | `products:write` (soft delete) |
| GET | `/admin/discounts` | `discounts:manage` |
| GET | `/admin/discounts/:id` | `discounts:manage` |
| POST | `/admin/discounts` | `discounts:manage` |
| PATCH | `/admin/discounts/:id` | `discounts:manage` |
| DELETE | `/admin/discounts/:id` | `discounts:manage` (deactivate) |
| POST | `/admin/catalog/flash-sales` | `discounts:manage` (alias creating an automatic discount) |

**Inventory administration**

| Method | Path | Access |
|---|---|---|
| GET | `/admin/batches` | `batches:manage` (batch inspector with health summary) |
| POST | `/admin/inventory/batches` | `batches:manage` (the only batch import) |
| POST | `/admin/inventory/adjust` | `stock:adjust` |
| GET | `/admin/inventory/ledger` | `stock:adjust` (the only ledger) |
| GET | `/admin/inventory/low-stock` | `products:read` |
| GET | `/admin/inventory/expiring-soon` | `batches:manage` |

**Orders (customer)**

| Method | Path | Access |
|---|---|---|
| POST | `/orders/checkout` | auth |
| POST | `/orders/validate-coupon` | public (30/min/IP; bearer optional) |
| GET | `/orders/my-orders` | auth |
| GET | `/orders/:idOrNumber` | owner or `orders:read` |
| GET | `/orders/:id/invoice` | owner or `orders:read` (PDF) |
| POST | `/orders/:id/cancel` | owner, while PENDING |
| GET | `/orders/:orderNumber/track` | owner or `orders:read` |

**Orders, fulfilment, invoices & analytics (administration)**

| Method | Path | Access |
|---|---|---|
| GET | `/admin/analytics/summary` | `analytics:read` |
| GET | `/admin/orders` | `orders:read` |
| PATCH | `/admin/orders/:id/status` | `orders:status_update` (+ `refunds:approve` for REFUNDED) |
| POST | `/admin/orders/:id/dispatch-courier` | `courier:assign` |
| GET | `/admin/orders/:id/tracking` | `orders:read` |
| GET | `/admin/invoices` | `orders:read` |
| GET | `/admin/invoices/summary` | `orders:read` |
| GET | `/admin/invoices/:id` | `orders:read` |
| GET | `/admin/invoices/:id/pdf` | `orders:read` (generates a missing PDF only with `invoice:generate`) |
| POST | `/admin/invoices/generate/:orderId` | `invoice:generate` |

**Dashboard, reports & finance (administration)**

| Method | Path | Access |
|---|---|---|
| GET | `/admin/analytics/activity` | `analytics:read` |
| GET | `/admin/reports/products` · `/customers` · `/inventory` | `analytics:read` |
| GET | `/admin/reports/profit` · `/profit/products` · `/profit/products/:id` | SUPER_ADMIN |
| GET · POST | `/admin/expenses` | SUPER_ADMIN |
| PATCH · DELETE | `/admin/expenses/:id` | SUPER_ADMIN |
| GET | `/admin/payments/summary` | `orders:read` |
| GET | `/admin/search?q=` | any staff role (groups filtered by permission) |

**Management (administration)**

| Method | Path | Access |
|---|---|---|
| GET | `/admin/customers` · `/admin/customers/:id` | `orders:read` |
| PATCH | `/admin/customers/:id` | `staff:manage` |
| GET · POST | `/admin/catalog/categories` | `products:read` · `products:write` |
| PATCH · DELETE | `/admin/catalog/categories/:id` | `products:write` |
| GET · PATCH | `/admin/catalog/brands` | `products:read` · `products:write` |
| GET · POST | `/admin/staff` | `staff:manage` |
| PATCH | `/admin/staff/:id` | `staff:manage` |
| GET | `/admin/roles` | `staff:manage` |
| GET | `/admin/system/status` | `staff:manage` |
| GET | `/admin/delivery/summary` | `orders:read` |

**Non-production only** (RBAC probes for the auth test-suite, not registered when `NODE_ENV=production`): `GET /admin/inventory/test` (`stock:adjust`), `POST /admin/orders/refund/test` (`refunds:approve`).
<!-- ENDPOINTS:END -->
