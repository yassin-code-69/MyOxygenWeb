### Phase 2 Context & Security Architecture Blueprint

Phase 2 engineers the security backbone and Role-Based Access Control (RBAC) engine for the **My Oxygen** Hono.js backend. Because this platform runs as a single-owner retail operation where inventory adjustments and financial refunds carry high operational sensitivity, access cannot be governed by simple boolean flags.

The architecture enforces a zero-trust RBAC model across the 5 designated operational roles and customer accounts:

- **Super Admin:** Unrestricted system orchestration, staff account creation, and system configuration.

- **Inventory Manager:** SKU maintenance, batch inspection, stock reconciliation, and scrap/quarantine authorization.

- **Order Manager:** Order lifecycle state transitions, invoice creation, courier assignment, and refund authorization.

- **Marketing Manager:** Coupon campaigns, time-based flash discounts, and customer acquisition telemetry.

- **Support Staff:** Read-only tracking lookup and draft refund request submissions.

- **Customer:** Profile management, personal order history, and self-service cancellation/refund requests.

Security is implemented at the HTTP routing boundary using typed middleware: access tokens are stateless JWTs, sensitive routes enforce rate limiting, and all payloads are validated using Zod with compile-time TypeScript type inference.

---

### Step 1: Authentication & Token Infrastructure (`apps/api`)

Install dependencies for cryptographic hashing, JWT handling, and input validation:

```bash
pnpm --filter @my-oxygen/api add bcryptjs jose @hono/zod-validator zod
pnpm --filter @my-oxygen/api add -D @types/bcryptjs

```

#### `apps/api/src/lib/jwt.ts`

```typescript
import { SignJWT, jwtVerify, JWTPayload } from "jose";
import { env } from "../env";

const SECRET = new TextEncoder().encode(env.JWT_SECRET);
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

export interface UserTokenPayload extends JWTPayload {
  sub: string;
  role: string;
  email?: string;
  phone: string;
}

export async function signAccessToken(
  payload: Omit<UserTokenPayload, "exp" | "iat">,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(SECRET);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<UserTokenPayload> {
  const { payload } = await jwtVerify(token, SECRET);
  return payload as UserTokenPayload;
}
```

---

### Step 2: Granular RBAC & Permission Matrix

Model explicit operational permissions and map them directly to the company roles defined in the requirement specification.

#### `apps/api/src/lib/rbac.ts`

```typescript
export const Permissions = {
  // Inventory & Batches
  PRODUCTS_READ: "products:read",
  PRODUCTS_WRITE: "products:write",
  BATCHES_MANAGE: "batches:manage",
  STOCK_ADJUST: "stock:adjust",

  // Orders & Fulfillment
  ORDERS_READ: "orders:read",
  ORDERS_STATUS_UPDATE: "orders:status_update",
  COURIER_ASSIGN: "courier:assign",
  INVOICE_GENERATE: "invoice:generate",

  // Refunds & Payments
  REFUNDS_REQUEST: "refunds:request",
  REFUNDS_APPROVE: "refunds:approve",

  // Marketing & Sales
  DISCOUNTS_MANAGE: "discounts:manage",
  ANALYTICS_READ: "analytics:read",

  // System Administration
  STAFF_MANAGE: "staff:manage",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const RolePermissions: Record<string, Permission[]> = {
  SUPER_ADMIN: Object.values(Permissions), // Full system access[cite: 3]
  INVENTORY_MANAGER: [
    Permissions.PRODUCTS_READ,
    Permissions.PRODUCTS_WRITE,
    Permissions.BATCHES_MANAGE,
    Permissions.STOCK_ADJUST,
    Permissions.ANALYTICS_READ,
  ],
  ORDER_MANAGER: [
    Permissions.ORDERS_READ,
    Permissions.ORDERS_STATUS_UPDATE,
    Permissions.COURIER_ASSIGN,
    Permissions.INVOICE_GENERATE,
    Permissions.REFUNDS_APPROVE,
    Permissions.ANALYTICS_READ,
  ],
  MARKETING_MANAGER: [
    Permissions.PRODUCTS_READ,
    Permissions.DISCOUNTS_MANAGE,
    Permissions.ANALYTICS_READ,
  ],
  SUPPORT_STAFF: [
    Permissions.PRODUCTS_READ,
    Permissions.ORDERS_READ,
    Permissions.REFUNDS_REQUEST,
  ],
  CUSTOMER: [],
};
```

---

### Step 3: Auth & RBAC Guards Middleware

Create modular middleware that verifies JWT identity and evaluates role permissions before any business handler runs.

#### `apps/api/src/middleware/auth.ts`

```typescript
import { createMiddleware } from "hono/factory";
import { verifyToken, UserTokenPayload } from "../lib/jwt";
import { Permission, RolePermissions } from "../lib/rbac";

export interface AuthContext {
  Variables: {
    user: UserTokenPayload;
  };
}

// Enforces valid JWT token
export const requireAuth = createMiddleware<AuthContext>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { success: false, error: "Authorization token required" },
      401,
    );
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = await verifyToken(token);
    c.set("user", payload);
    await next();
  } catch {
    return c.json(
      { success: false, error: "Invalid or expired authentication token" },
      401,
    );
  }
});

// Enforces specified role(s)
export const requireRole = (...roles: string[]) => {
  return createMiddleware<AuthContext>(async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      return c.json(
        { success: false, error: "Forbidden: Insufficient role permissions" },
        403,
      );
    }
    await next();
  });
};

// Enforces granular permission based on user role
export const requirePermission = (permission: Permission) => {
  return createMiddleware<AuthContext>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const assignedPermissions = RolePermissions[user.role] || [];
    const hasPermission =
      user.role === "SUPER_ADMIN" || assignedPermissions.includes(permission);

    if (!hasPermission) {
      return c.json(
        {
          success: false,
          error: `Forbidden: Missing required permission [${permission}]`,
        },
        403,
      );
    }
    await next();
  });
};
```

---

### Step 4: Authentication Controller & Schemas

Support customer registration and multi-method login (Phone / Email with OTP-ready payload schemas).

#### `apps/api/src/routes/auth.schema.ts`

```typescript
import { z } from "zod";

export const registerSchema = z.object({
  fullName: z.string().min(2, "Name must have at least 2 characters"),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, "Invalid phone number format"),
  email: z.string().email("Invalid email address").optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  identifier: z.string().min(3, "Phone or Email is required"), // Accepts phone or email[cite: 3]
  password: z.string().min(6, "Password is required"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});
```

#### `apps/api/src/routes/auth.ts`

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { db, users } from "@my-oxygen/database";
import { registerSchema, loginSchema, refreshTokenSchema } from "./auth.schema";
import { signAccessToken, signRefreshToken, verifyToken } from "../lib/jwt";
import { requireAuth, AuthContext } from "../middleware/auth";

export const authRoutes = new Hono<AuthContext>();

// User Registration
authRoutes.post("/register", zValidator("json", registerSchema), async (c) => {
  const { fullName, phone, email, password } = c.req.valid("json");

  // Check unique constraints
  const existingUser = await db.query.users.findFirst({
    where: or(
      eq(users.phone, phone),
      email ? eq(users.email, email) : undefined,
    ),
  });

  if (existingUser) {
    return c.json(
      { success: false, error: "User with this phone or email already exists" },
      409,
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [newUser] = await db
    .insert(users)
    .values({
      fullName,
      phone,
      email: email || null,
      passwordHash,
      role: "CUSTOMER",
    })
    .returning({
      id: users.id,
      fullName: users.fullName,
      phone: users.phone,
      email: users.email,
      role: users.role,
    });

  const accessToken = await signAccessToken({
    sub: newUser.id,
    role: newUser.role,
    phone: newUser.phone,
    email: newUser.email || undefined,
  });
  const refreshToken = await signRefreshToken(newUser.id);

  return c.json(
    {
      success: true,
      data: { user: newUser, accessToken, refreshToken },
    },
    201,
  );
});

// User & Admin Login
authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const { identifier, password } = c.req.valid("json");

  // Lookup user by phone or email
  const user = await db.query.users.findFirst({
    where: or(eq(users.phone, identifier), eq(users.email, identifier)),
  });

  if (!user || !user.passwordHash || !user.isActive) {
    return c.json(
      { success: false, error: "Invalid credentials or inactive account" },
      401,
    );
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return c.json({ success: false, error: "Invalid credentials" }, 401);
  }

  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    phone: user.phone,
    email: user.email || undefined,
  });
  const refreshToken = await signRefreshToken(user.id);

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    },
  });
});

// Refresh Access Token
authRoutes.post(
  "/refresh",
  zValidator("json", refreshTokenSchema),
  async (c) => {
    const { refreshToken } = c.req.valid("json");

    try {
      const payload = await verifyToken(refreshToken);
      const user = await db.query.users.findFirst({
        where: eq(users.id, payload.sub as string),
      });

      if (!user || !user.isActive) {
        return c.json({ success: false, error: "Invalid user session" }, 401);
      }

      const newAccessToken = await signAccessToken({
        sub: user.id,
        role: user.role,
        phone: user.phone,
        email: user.email || undefined,
      });

      return c.json({ success: true, data: { accessToken: newAccessToken } });
    } catch {
      return c.json(
        { success: false, error: "Invalid or expired refresh token" },
        401,
      );
    }
  },
);

// Authenticated User Identity Probe
authRoutes.get("/me", requireAuth, async (c) => {
  const userPayload = c.get("user");
  const user = await db.query.users.findFirst({
    where: eq(users.id, userPayload.sub),
    columns: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  return c.json({ success: true, data: user });
});
```

---

### Step 5: Sliding-Window Rate Limiting & Security Hardening

Guard authentication entry points against brute-force attacks and configure protective HTTP response headers.

#### `apps/api/src/middleware/rate-limiter.ts`

```typescript
import { createMiddleware } from "hono/factory";

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const clientHits = new Map<string, RateLimitStore>();

export function rateLimiter(options: {
  maxRequests: number;
  windowMs: number;
}) {
  return createMiddleware(async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() || "unknown-client";
    const now = Date.now();

    const record = clientHits.get(ip);

    if (!record || now > record.resetTime) {
      clientHits.set(ip, { count: 1, resetTime: now + options.windowMs });
    } else {
      record.count += 1;
      if (record.count > options.maxRequests) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        c.header("Retry-After", retryAfter.toString());
        return c.json(
          {
            success: false,
            error: "Too many requests. Please try again later.",
          },
          429,
        );
      }
    }

    await next();
  });
}
```

#### `apps/api/src/middleware/security-headers.ts`

```typescript
import { createMiddleware } from "hono/factory";

export const securityHeaders = createMiddleware(async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});
```

---

### Step 6: Route Mounting & Protected Mock Handlers

Mount the authentication endpoints and create reference routes demonstrating RBAC-guarded execution for Phase 3 and Phase 4.

#### `apps/api/src/index.ts` (Updated)

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./routes/auth";
import { securityHeaders } from "./middleware/security-headers";
import { rateLimiter } from "./middleware/rate-limiter";
import { requireAuth, requirePermission, AuthContext } from "./middleware/auth";
import { Permissions } from "./lib/rbac";
import { env } from "./env";

const app = new Hono<AuthContext>();

// Global Middlewares
app.use("*", logger());
app.use("*", securityHeaders);
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN.split(","),
    credentials: true,
  }),
);

// Apply strict rate limiting to auth routes (15 req per min)
app.use("/auth/*", rateLimiter({ maxRequests: 15, windowMs: 60 * 1000 }));
app.route("/auth", authRoutes);

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

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(
    `🚀 My Oxygen API running with RBAC on http://localhost:${info.port}`,
  );
});

export default app;
```

---

### Step 7: Phase 2 Verification Checklist

Execute these validation tests to confirm authentication, rate limiting, and permission isolation:

1. **Customer Registration & Token Generation:**

```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Jane Doe",
    "phone": "+8801811111111",
    "email": "jane@example.com",
    "password": "Password123!"
  }'

```

_Expected outcome:_ HTTP 201 returning created customer user object, `accessToken`, and `refreshToken`. 2. **Login with Phone Number:**

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+8801811111111",
    "password": "Password123!"
  }'

```

_Expected outcome:_ HTTP 200 returning tokens. 3. **Verify Customer RBAC Rejection on Admin Route:**

```bash
curl -X GET http://localhost:4000/admin/inventory/test \
  -H "Authorization: Bearer <CUSTOMER_ACCESS_TOKEN>"

```

_Expected outcome:_ HTTP 403 Forbidden with `Forbidden: Missing required permission [stock:adjust]`. 4. **Verify Super Admin Permitted Access:**
Login with Super Admin credentials seeded in Phase 1 (`admin@myoxygen.com` / `Admin@MyOxygen2026`), copy the token, and call the refund endpoint:

```bash
curl -X POST http://localhost:4000/admin/orders/refund/test \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"

```

_Expected outcome:_ HTTP 200 with `Refund approval access granted`. 5. **Verify Rate Limiter:**
Execute 16 rapid requests against `POST /auth/login`.
_Expected outcome:_ 16th request returns HTTP 429 Too Many Requests with header `Retry-After`.
