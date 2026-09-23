# Plan 010: Concurrency Hardening, FEFO Race Testing & Docker Packaging

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Working directories**: `backend/` and `frontend/`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: plans/007-purchase-funnel-checkout.md, plans/008-courier-invoices-notifications.md
- **Category**: correctness | perf | dx
- **Planned at**: 2026-09-22

---

## Why this matters

Phase 10 hardens the entire system for real-world production concurrency:
1. **FEFO Race-Condition Resilience**: Proves that concurrent customer checkouts never oversell stock or push `available_quantity` negative on perishable goods.
2. **Health Check & Observability**: Provides deep system health diagnostics (PostgreSQL connection verification, latency, uptime).
3. **Containerization & Deployment Readiness**: Standalone multi-stage Dockerfiles for both Bun backend and Next.js frontend with non-root security principles.

---

## Current state

- All backend routes, inventory reservation, and frontend pages are implemented.
- Total test suites passing: Auth, Inventory, Catalog, Orders, Courier/Invoice, Admin.

---

## Commands you will need

| Purpose | Directory | Command | Expected on success |
|---|---|---|---|
| Concurrency Test | `backend/` | `bun test src/tests/inventory-concurrency.test.ts` | exit 0, all pass |
| Full Test Suite | `backend/` | `bun test` | exit 0, 100% pass |
| Backend Build | `backend/` | `bun x tsc --noEmit` | exit 0, zero errors |
| Frontend Build | `frontend/` | `bun run build` | exit 0, compiled successfully |

---

## Scope

**In scope**:
- `backend/src/tests/inventory-concurrency.test.ts` (10 concurrent checkout race condition test)
- `backend/src/routes/health.ts` (Deep health check endpoint)
- `backend/src/index.ts` (Mount `/health`)
- `backend/Dockerfile` (Bun production container)
- `frontend/Dockerfile` (Next.js standalone container)
- `docker-compose.yml` (Root container orchestration)

**Out of scope**:
- Do not modify database schemas or enum definitions.

---

## Steps

### Step 1: Implement Concurrency Stress Test (`backend/src/tests/inventory-concurrency.test.ts`)

Create test that:
1. Seeds a temporary product with a single batch having `availableQuantity = 5`.
2. Fires 10 concurrent requests calling `inventoryService.reserveStock()` for 1 unit each using `Promise.all()`.
3. Verifies that:
   - Exactly 5 promises resolve successfully.
   - Exactly 5 promises reject with `INSUFFICIENT_STOCK` error.
   - The remaining `availableQuantity` in the database is exactly 0 (never negative).
   - Exactly 5 `PURCHASE` audit rows are logged in `stockHistoryLogs`.

**Verify**: `bun test src/tests/inventory-concurrency.test.ts` passes.

### Step 2: Implement Health Check Endpoint (`backend/src/routes/health.ts`)

1. Create `backend/src/routes/health.ts`:
   - `GET /health`:
     - Executes `SELECT 1` against the database pool to confirm connection.
     - Measures database ping latency.
     - Returns `{ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString(), database: { status: "connected", latencyMs } }`.
     - Returns HTTP 503 if database check fails.
2. Mount in `backend/src/index.ts`.

**Verify**: `bun x tsc --noEmit` in `backend/` passes.

### Step 3: Create Production Dockerfiles

1. **`backend/Dockerfile`**:
   - Multi-stage build using `oven/bun:1.2-alpine`.
   - Copies `package.json`, installs production dependencies with `bun install --frozen-lockfile --production`.
   - Runs as non-root user `bun`.
   - Exposes port 4000.
   - Healthcheck: `wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1`.

2. **`frontend/Dockerfile`**:
   - Multi-stage build: builder and runner.
   - Copies standalone `.next/standalone` output.
   - Runs as non-root user `nodejs`.
   - Exposes port 3000.

3. **`docker-compose.yml`**:
   - Configures `backend` and `frontend` services with environment variables and restart policies.

**Verify**: Check Docker syntax and run `bun test` in `backend/` to ensure all tests pass.

---

## Done criteria

- [ ] `bun test` in `backend/` runs the full test suite with 100% pass rate.
- [ ] Concurrent reservation test passes with zero negative inventory.
- [ ] `GET /health` endpoint responds with database status and latency.
- [ ] `bun run build` in `frontend/` compiles with zero errors.
- [ ] `plans/README.md` status row for Plan 010 is updated to `DONE`.

---

## STOP conditions

- If PostgreSQL connection pool exhausts during concurrency tests, ensure pool max connection size is configured properly and clients are released.
