# Stage 1: Install production dependencies
FROM oven/bun:1.2-alpine AS dependencies
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile

# Stage 2: Production runner
FROM oven/bun:1.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Copy production node_modules and source code
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

# Create required uploads directory and ensure non-root bun ownership
RUN mkdir -p /app/uploads/invoices && chown -R bun:bun /app

USER bun

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["bun", "src/index.ts"]
