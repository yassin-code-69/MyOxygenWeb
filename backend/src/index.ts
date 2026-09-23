import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { env } from "./env";
import { healthRoute } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { catalog } from "./routes/catalog";
import { securityHeaders } from "./middleware/security-headers";
import { rateLimiter } from "./middleware/rate-limiter";
import { requireAuth, requirePermission, type AuthContext } from "./middleware/auth";
import { Permissions } from "./lib/rbac";
import { inventoryRoutes } from "./routes/inventory";
import { ordersRoute } from "./routes/orders";
import { adminBatchesRoute } from "./routes/admin.batches";
import { adminOrdersRoute } from "./routes/admin.orders";
import { adminInvoicesRoute } from "./routes/admin.invoices";
import { startExpiryScheduler } from "./jobs/expiry-scheduler";

const app = new Hono<AuthContext>();

// Global Middlewares
app.use("*", logger());
app.use("*", prettyJSON());
app.use("*", securityHeaders);
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length", "X-Cache"],
    maxAge: 600,
    credentials: true,
  }),
);

// Centralized Deep Health Check & DB Ping Probe
app.route("/health", healthRoute);

// Apply rate limiting to auth routes (15 req per min)
app.use("/auth/*", rateLimiter({ maxRequests: 15, windowMs: 60 * 1000 }));
app.route("/auth", authRoutes);
app.route("/", catalog);

// Protected RBAC Verification Routes
app.get(
  "/admin/inventory/test",
  requireAuth,
  requirePermission(Permissions.STOCK_ADJUST),
  (c) => c.json({ success: true, message: "Stock adjustment access granted" }),
);

app.post(
  "/admin/orders/refund/test",
  requireAuth,
  requirePermission(Permissions.REFUNDS_APPROVE),
  (c) => c.json({ success: true, message: "Refund approval access granted" }),
);

// Global Error Handler
app.onError((err, c) => {
  console.error("Unhandled Application Exception:", err);
  return c.json(
    {
      success: false,
      error: {
        message: err.message || "Internal Server Error",
        stack: env.NODE_ENV === "development" ? err.stack : undefined,
      },
    },
    500,
  );
});

// Admin Batches, Orders & Invoices Routes
app.route("/admin", adminBatchesRoute);
app.route("/admin", adminOrdersRoute);
app.route("/admin", adminInvoicesRoute);

// Inventory Routes
app.route("/inventory", inventoryRoutes);
app.route("/admin/inventory", inventoryRoutes);

// Order & Checkout Funnel Routes
app.route("/orders", ordersRoute);

if (import.meta.main) {
  startExpiryScheduler();
}

export default {
  port: env.PORT,
  fetch: app.fetch,
};

export { app };
