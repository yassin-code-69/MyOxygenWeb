import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq, inArray, or } from "drizzle-orm";
import { db, users } from "../db";
import { app } from "../index";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyToken } from "../lib/jwt";
import { Permissions, RolePermissions } from "../lib/rbac";
import { resetRateLimiter } from "../middleware/rate-limiter";

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("Phase 2: Authentication & RBAC Engine", () => {
  const testRunId = Date.now().toString().slice(-6);
  const testPhone = `+88019${testRunId}01`;
  const secondPhone = `+88019${testRunId}03`;
  const testEmail = `testuser_${testRunId}@example.com`;
  const mixedCaseEmail = `MixedCase_${testRunId}@Example.COM`;
  const testPassword = "Password123!";
  const testFullName = "Test Customer";
  // Registration stores Bangladeshi mobiles canonically as 01XXXXXXXXX.
  const canonical = (phone: string): string => `0${phone.slice(4)}`;
  const storedPhone = canonical(testPhone);
  const phones = [testPhone, secondPhone, `+88019${testRunId}02`, `+88019${testRunId}09`].map(canonical);
  const emails = [testEmail, mixedCaseEmail.toLowerCase()];

  let customerAccessToken: string;
  let customerRefreshToken: string;
  let customerUserId: string;
  let superAdminAccessToken: string;

  const cleanup = async () => {
    await db.delete(users).where(or(inArray(users.phone, phones), inArray(users.email, emails)));
  };

  beforeAll(async () => {
    resetRateLimiter();
    await cleanup();
  });

  afterAll(async () => {
    resetRateLimiter();
    await cleanup();
  });

  describe("1. Customer Registration (POST /auth/register)", () => {
    it("registers a new customer and returns tokens without sensitive fields", async () => {
      const res = await app.request(
        "/auth/register",
        json({ fullName: testFullName, phone: testPhone, email: testEmail, password: testPassword }),
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      const { user, accessToken, refreshToken } = body.data;
      expect(user.fullName).toBe(testFullName);
      expect(user.phone).toBe(storedPhone);
      expect(user.email).toBe(testEmail);
      expect(user.role).toBe("CUSTOMER");
      expect(user.passwordHash).toBeUndefined();
      expect(typeof accessToken).toBe("string");
      expect(typeof refreshToken).toBe("string");

      customerUserId = user.id;
      customerAccessToken = accessToken;
      customerRefreshToken = refreshToken;
    });

    it("stores emails lower-case", async () => {
      const res = await app.request(
        "/auth/register",
        json({ fullName: "Mixed Case", phone: secondPhone, email: mixedCaseEmail, password: testPassword }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.user.email).toBe(mixedCaseEmail.toLowerCase());
    });

    it("rejects a duplicate phone with 409 CONFLICT", async () => {
      const res = await app.request(
        "/auth/register",
        json({ fullName: "Another Person", phone: testPhone, email: `unique_${testRunId}@example.com`, password: testPassword }),
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toContain("already exists");
    });

    it("rejects a duplicate email regardless of case with 409", async () => {
      const res = await app.request(
        "/auth/register",
        json({ fullName: "Case Twin", phone: `+88019${testRunId}09`, email: testEmail.toUpperCase(), password: testPassword }),
      );
      expect(res.status).toBe(409);
    });

    it("rejects an invalid phone with 422 VALIDATION_ERROR and field details", async () => {
      const res = await app.request(
        "/auth/register",
        json({ fullName: "Invalid Phone", phone: "invalid-phone", email: "invalid_phone@example.com", password: testPassword }),
      );
      expect(res.status).toBe(422);
      const body = (await res.json()) as ErrorEnvelope & {
        error: { details: { target: string; fieldErrors: Record<string, string[]> } };
      };
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details.target).toBe("json");
      expect(body.error.details.fieldErrors.phone).toBeDefined();
    });

    it("rejects a password shorter than 8 characters with 422", async () => {
      const res = await app.request(
        "/auth/register",
        json({ fullName: "Short Password", phone: `+88019${testRunId}02`, password: "short" }),
      );
      expect(res.status).toBe(422);
    });

    it("rejects malformed JSON with 400 BAD_REQUEST", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.code).toBe("BAD_REQUEST");
    });
  });

  describe("2. Login (POST /auth/login)", () => {
    it("authenticates with phone number", async () => {
      const res = await app.request("/auth/login", json({ identifier: testPhone, password: testPassword }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.user.phone).toBe(storedPhone);
      expect(body.data.user.role).toBe("CUSTOMER");
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();
    });

    it("matches the phone in any accepted format", async () => {
      for (const identifier of [storedPhone, testPhone.slice(1), `${storedPhone.slice(0, 5)}-${storedPhone.slice(5)}`]) {
        const res = await app.request("/auth/login", json({ identifier, password: testPassword }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.user.phone).toBe(storedPhone);
      }
    });

    it("authenticates with email case-insensitively", async () => {
      const res = await app.request("/auth/login", json({ identifier: testEmail.toUpperCase(), password: testPassword }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.user.email).toBe(testEmail);
    });

    it("authenticates the seeded super admin", async () => {
      const res = await app.request(
        "/auth/login",
        json({ identifier: "admin@myoxygen.com", password: "Admin@MyOxygen2026" }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.user.role).toBe("SUPER_ADMIN");
      superAdminAccessToken = body.data.accessToken;
    });

    it("returns the same generic 401 for a wrong password and an unknown account", async () => {
      const wrong = await app.request("/auth/login", json({ identifier: testPhone, password: "WrongPassword!" }));
      const unknown = await app.request("/auth/login", json({ identifier: "+8801999999999", password: "Password123!" }));

      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      const wrongBody = (await wrong.json()) as ErrorEnvelope;
      const unknownBody = (await unknown.json()) as ErrorEnvelope;
      expect(wrongBody.error).toEqual({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      expect(unknownBody.error).toEqual(wrongBody.error);
    });
  });

  describe("3. Tokens, /auth/me and /auth/refresh", () => {
    it("issues access tokens carrying the user's identity", async () => {
      const payload = await verifyAccessToken(customerAccessToken);
      expect(payload.sub).toBe(customerUserId);
      expect(payload.role).toBe("CUSTOMER");
      expect(payload.phone).toBe(storedPhone);
      expect(payload.email).toBe(testEmail);
      expect(payload.tokenType).toBe("access");
    });

    it("returns the profile on GET /auth/me", async () => {
      const res = await app.request("/auth/me", { headers: { Authorization: `Bearer ${customerAccessToken}` } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(customerUserId);
      expect(body.data.phone).toBe(storedPhone);
      expect(body.data.role).toBe("CUSTOMER");
      expect(body.data.createdAt).toBeDefined();
    });

    it("rejects /auth/me without a token", async () => {
      const res = await app.request("/auth/me");
      expect(res.status).toBe(401);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error).toEqual({ code: "UNAUTHORIZED", message: "Authorization token required" });
    });

    it("rejects /auth/me with a malformed token", async () => {
      const res = await app.request("/auth/me", { headers: { Authorization: "Bearer invalid-token-string" } });
      expect(res.status).toBe(401);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.message).toBe("Invalid or expired authentication token");
    });

    it("rejects a refresh token used as an access token", async () => {
      const res = await app.request("/auth/me", { headers: { Authorization: `Bearer ${customerRefreshToken}` } });
      expect(res.status).toBe(401);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.message).toBe("Access token required");
    });

    it("refreshes the access token with a valid refresh token", async () => {
      const res = await app.request("/auth/refresh", json({ refreshToken: customerRefreshToken }));
      expect(res.status).toBe(200);
      const body = await res.json();
      const payload = await verifyToken(body.data.accessToken);
      expect(payload.sub).toBe(customerUserId);
      expect(payload.tokenType).toBe("access");
    });

    it("rejects an ACCESS token on /auth/refresh", async () => {
      const res = await app.request("/auth/refresh", json({ refreshToken: customerAccessToken }));
      expect(res.status).toBe(401);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.message).toBe("Invalid or expired refresh token");
    });

    it("rejects a garbage refresh token", async () => {
      const res = await app.request("/auth/refresh", json({ refreshToken: "invalid-refresh-token" }));
      expect(res.status).toBe(401);
    });

    it("locks out deactivated users immediately (me, refresh and login)", async () => {
      await db.update(users).set({ isActive: false }).where(eq(users.id, customerUserId));
      try {
        const me = await app.request("/auth/me", { headers: { Authorization: `Bearer ${customerAccessToken}` } });
        const refresh = await app.request("/auth/refresh", json({ refreshToken: customerRefreshToken }));
        const login = await app.request("/auth/login", json({ identifier: testPhone, password: testPassword }));
        expect(me.status).toBe(401);
        expect(refresh.status).toBe(401);
        expect(login.status).toBe(401);
        expect(((await login.json()) as ErrorEnvelope).error.message).toBe("Invalid credentials");
      } finally {
        await db.update(users).set({ isActive: true }).where(eq(users.id, customerUserId));
      }
    });
  });

  describe("4. RBAC permission matrix & enforcement", () => {
    it("forbids a customer on the stock-adjust probe", async () => {
      const res = await app.request("/admin/inventory/test", {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toBe(`Missing required permission [${Permissions.STOCK_ADJUST}]`);
    });

    it("forbids a customer on the refund-approval probe", async () => {
      const res = await app.request("/admin/orders/refund/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.error.message).toBe(`Missing required permission [${Permissions.REFUNDS_APPROVE}]`);
    });

    it("uses the role stored in the database, not the one claimed in the token", async () => {
      const forged = await signAccessToken({ sub: customerUserId, role: "SUPER_ADMIN", phone: testPhone });
      const res = await app.request("/admin/inventory/test", { headers: { Authorization: `Bearer ${forged}` } });
      expect(res.status).toBe(403);
    });

    it("rejects tokens for users that no longer exist", async () => {
      const ghost = await signAccessToken({ sub: crypto.randomUUID(), role: "SUPER_ADMIN", phone: "+8801000000000" });
      const res = await app.request("/admin/inventory/test", { headers: { Authorization: `Bearer ${ghost}` } });
      expect(res.status).toBe(401);
      const refresh = await app.request("/auth/refresh", json({ refreshToken: await signRefreshToken(crypto.randomUUID()) }));
      expect(refresh.status).toBe(401);
    });

    it("grants the super admin access to both probes", async () => {
      const stock = await app.request("/admin/inventory/test", {
        headers: { Authorization: `Bearer ${superAdminAccessToken}` },
      });
      const refund = await app.request("/admin/orders/refund/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${superAdminAccessToken}` },
      });
      expect(stock.status).toBe(200);
      expect(refund.status).toBe(200);
      expect((await stock.json()).data.message).toBe("Stock adjustment access granted");
      expect((await refund.json()).data.message).toBe("Refund approval access granted");
    });

    it("keeps the role → permission matrix intact", () => {
      expect(RolePermissions.SUPER_ADMIN).toHaveLength(13);
      expect(RolePermissions.INVENTORY_MANAGER).toContain(Permissions.STOCK_ADJUST);
      expect(RolePermissions.INVENTORY_MANAGER).toContain(Permissions.PRODUCTS_WRITE);
      expect(RolePermissions.ORDER_MANAGER).toContain(Permissions.ORDERS_STATUS_UPDATE);
      expect(RolePermissions.ORDER_MANAGER).toContain(Permissions.REFUNDS_APPROVE);
      expect(RolePermissions.ORDER_MANAGER).not.toContain(Permissions.STOCK_ADJUST);
      expect(RolePermissions.MARKETING_MANAGER).toContain(Permissions.DISCOUNTS_MANAGE);
      expect(RolePermissions.SUPPORT_STAFF).toContain(Permissions.REFUNDS_REQUEST);
      expect(RolePermissions.SUPPORT_STAFF).not.toContain(Permissions.REFUNDS_APPROVE);
      expect(RolePermissions.CUSTOMER).toHaveLength(0);
    });
  });

  describe("5. Security headers, 404 envelope & rate limiting", () => {
    it("sets API security headers including a locked-down CSP", async () => {
      const res = await app.request("/health");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(res.headers.get("X-Request-Id")).toBeTruthy();
    });

    it("answers unknown routes with the error envelope", async () => {
      const res = await app.request("/definitely/not/a/route");
      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorEnvelope;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns 429 with Retry-After after 15 login attempts and ignores spoofed X-Forwarded-For", async () => {
      resetRateLimiter();
      const attempt = (ip: string) =>
        app.request("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ identifier: "unknown@example.com", password: "WrongPassword123!" }),
        });

      for (let i = 0; i < 15; i++) {
        expect((await attempt("192.168.10.99")).status).toBe(401);
      }

      const blocked = await attempt("192.168.10.99");
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
      const body = (await blocked.json()) as ErrorEnvelope;
      expect(body.error.code).toBe("RATE_LIMITED");

      // TRUST_PROXY=false: a different forwarded IP must not reset the budget.
      expect((await attempt("10.0.0.1")).status).toBe(429);
      resetRateLimiter();
    }, 30_000);

    it("does not rate-limit GET /auth/me", async () => {
      resetRateLimiter();
      for (let i = 0; i < 20; i++) {
        const res = await app.request("/auth/me", { headers: { Authorization: `Bearer ${superAdminAccessToken}` } });
        expect(res.status).toBe(200);
      }
    });
  });
});
