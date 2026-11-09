# syntax=docker/dockerfile:1
# =============================================================================
# My Oxygen storefront — Next.js 16 standalone image
#
#   docker build \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     -t my-oxygen-frontend ./frontend
#
# NEXT_PUBLIC_API_URL is inlined into the browser bundle at BUILD time.
# Setting it at run time has no effect on client code: rebuild the image for
# every environment (staging, production) with the right API origin.
#
# Stages
#   bun      source of the Bun binary (lockfile-exact installs)
#   deps     node_modules from the frozen bun.lock
#   builder  `next build` (type-checks the app) -> .next/standalone
#   runner   minimal Node runtime, non-root, HEALTHCHECK
# =============================================================================

# Next.js 16 needs Node >= 20.9; 24 is the current LTS line.
ARG NODE_VERSION=24
# Keep on the same minor as backend/Dockerfile and CI.
ARG BUN_VERSION=1.4

# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS bun

# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app

# Required: public origin of the API as seen from the BROWSER,
# e.g. https://api.myoxygen.com.bd (no trailing slash).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Fail fast instead of silently shipping a bundle that calls localhost.
# next/font downloads Google Fonts during the build (needs outbound HTTPS).
RUN if [ -z "${NEXT_PUBLIC_API_URL}" ]; then \
      echo "ERROR: build arg NEXT_PUBLIC_API_URL is required" >&2; exit 1; \
    fi \
 && node_modules/.bin/next build

# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

# Standalone server + the assets it does not bundle itself (static chunks, public/).
# Owned by the app user because Next writes its image/ISR cache under .next/.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "server.js"]
