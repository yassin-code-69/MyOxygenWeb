# syntax=docker/dockerfile:1
# =============================================================================
# My Oxygen API — Bun + Hono production image
#
#   docker build -t my-oxygen-backend ./backend                    # runtime image
#   docker build --target migrator -t my-oxygen-migrator ./backend # migrations
#
# Stages
#   deps       all dependencies (dev included) from the frozen lockfile
#   typecheck  `tsc --noEmit` over the sources; a type error fails the build
#   migrator   one-off image with drizzle-kit for `bun run db:migrate` / seed
#   prod-deps  production dependencies only
#   runtime    final image: non-root, no secrets, HEALTHCHECK on /health
#
# Configuration comes exclusively from the environment at run time
# (DATABASE_URL, JWT_SECRET, ... see backend/.env.example). No .env file is
# ever copied into an image (.dockerignore excludes .env and .env.*).
# =============================================================================

# Minor version pinned; bump deliberately (keep CI's BUN_VERSION on the same minor).
ARG BUN_VERSION=1.4

# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /app

# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# -----------------------------------------------------------------------------
FROM deps AS typecheck
COPY tsconfig.json drizzle.config.ts ./
COPY scripts ./scripts
COPY src ./src
RUN bun run typecheck

# -----------------------------------------------------------------------------
# One-off migration / seed runner. drizzle-kit is a devDependency, so this
# image keeps the full dependency tree; it is never used to serve traffic.
#   docker compose run --rm migrate                      # bun run db:migrate
#   docker compose run --rm migrate bun run db:seed      # idempotent seed
FROM deps AS migrator
ENV NODE_ENV=production
COPY tsconfig.json drizzle.config.ts ./
COPY --from=typecheck /app/src ./src
USER bun
CMD ["bun", "run", "db:migrate"]

# -----------------------------------------------------------------------------
FROM base AS prod-deps
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

# -----------------------------------------------------------------------------
FROM base AS runtime

ENV NODE_ENV=production \
    PORT=4000

# Application code stays root-owned (read-only for the app user).
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
# Copying from `typecheck` (not the context) guarantees the type check ran.
COPY --from=typecheck /app/src ./src

# Invoice PDFs are written to ./uploads/invoices; mount a volume here in
# production. The directory is pre-created so a new named volume inherits
# the non-root ownership.
RUN mkdir -p /app/uploads/invoices && chown -R bun:bun /app/uploads

USER bun

EXPOSE 4000

# /health pings the database and returns 503 when it is unreachable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider "http://127.0.0.1:${PORT}/health" || exit 1

# Bun runs as PID 1 and handles SIGTERM itself (graceful shutdown in src/index.ts).
CMD ["bun", "src/index.ts"]
