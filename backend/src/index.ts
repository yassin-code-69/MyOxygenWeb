import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import { closeDb } from "./db/client";
import { corsOrigins, env } from "./env";
import { startBackgroundJobs, stopBackgroundJobs } from "./jobs";
import { ok } from "./lib/http";
import { Permissions } from "./lib/rbac";
import { requireAuth, requirePermission, type AuthContext } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { rateLimiter } from "./middleware/rate-limiter";
import { securityHeaders } from "./middleware/security-headers";
import { adminBatchesRoute } from "./routes/admin.batches";
import { adminInvoicesRoute } from "./routes/admin.invoices";
import { adminOrdersRoute } from "./routes/admin.orders";
import { authRoutes } from "./routes/auth";
import { catalog } from "./routes/catalog";
import { healthRoute } from "./routes/health";
import { inventoryRoutes } from "./routes/inventory";
import { ordersRoute } from "./routes/orders";

const app = new Hono<AuthContext>();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use("*", requestId());
if (env.NODE_ENV !== "test") {
  app.use("*", logger());
}
app.use("*", prettyJSON());
app.use("*", securityHeaders);

const allowAnyOrigin = corsOrigins.includes("*"); // rejected in production by env.ts
app.use(
  "*",
  cors({
    origin: allowAnyOrigin ? "*" : [...corsOrigins],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length", "Content-Disposition", "X-Cache", "X-Request-Id", "Retry-After"],
    maxAge: 600,
    credentials: !allowAnyOrigin,
  }),
);

app.onError(errorHandler);
app.notFound(notFoundHandler);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.route("/health", healthRoute);

// Brute-force protection on credential endpoints only (not /auth/me).
const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_REQUESTS = 15;
for (const path of ["/auth/login", "/auth/register", "/auth/refresh"] as const) {
  app.use(path, rateLimiter({ name: path, maxRequests: AUTH_MAX_REQUESTS, windowMs: AUTH_WINDOW_MS }));
}
app.route("/auth", authRoutes);

app.route("/", catalog);

// RBAC probe routes used by the auth test-suite. Never exposed in production.
if (env.NODE_ENV !== "production") {
  app.get(
    "/admin/inventory/test",
    requireAuth,
    requirePermission(Permissions.STOCK_ADJUST),
    (c) => ok(c, { message: "Stock adjustment access granted" }),
  );
  app.post(
    "/admin/orders/refund/test",
    requireAuth,
    requirePermission(Permissions.REFUNDS_APPROVE),
    (c) => ok(c, { message: "Refund approval access granted" }),
  );
}

app.route("/admin", adminBatchesRoute);
app.route("/admin", adminOrdersRoute);
app.route("/admin", adminInvoicesRoute);
app.route("/admin/inventory", inventoryRoutes);
app.route("/orders", ordersRoute);

export { app };

// ---------------------------------------------------------------------------
// Process entry point (skipped when imported by tests)
// ---------------------------------------------------------------------------
if (import.meta.main) {
  const server = Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
  });
  console.log(
    JSON.stringify({ level: "info", event: "server_started", port: server.port, env: env.NODE_ENV }),
  );

  startBackgroundJobs();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({ level: "info", event: "shutdown_started", signal }));

    // Hard deadline so a stuck connection can never block a deploy.
    const forceExit = setTimeout(() => {
      console.error(JSON.stringify({ level: "error", event: "shutdown_timeout" }));
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    try {
      await stopBackgroundJobs();
      await server.stop(); // stop accepting connections, let in-flight requests finish
      await closeDb();
      console.log(JSON.stringify({ level: "info", event: "shutdown_complete" }));
      process.exit(0);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "shutdown_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
