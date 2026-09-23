import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../index";
import { db, users } from "../db";
import { eq, or, like } from "drizzle-orm";
import { verifyToken, signAccessToken } from "../lib/jwt";
import { Permissions, RolePermissions } from "../lib/rbac";
import { resetRateLimiter } from "../middleware/rate-limiter";

describe("Phase 2: Authentication & RBAC Engine", () => {
  const testRunId = Date.now().toString().slice(-6);
  const testPhone = `+88019${testRunId}01`;
  const testEmail = `testuser_${testRunId}@example.com`;
  const testPassword = "Password123!";
  const testFullName = "Test Customer";

  let customerAccessToken: string;
  let customerRefreshToken: string;
  let customerUserId: string;

  let superAdminAccessToken: string;

  beforeAll(async () => {
    resetRateLimiter();
    // Clean up any existing test users matching test phone or email pattern
    await db
      .delete(users)
      .where(or(eq(users.phone, testPhone), eq(users.email, testEmail)));
  });

  afterAll(async () => {
    // Clean up created test user
    await db
      .delete(users)
      .where(or(eq(users.phone, testPhone), eq(users.email, testEmail)));
  });

  describe("1. Customer Registration (POST /auth/register)", () => {
    it("should successfully register a new customer", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: testFullName,
          phone: testPhone,
          email: testEmail,
          password: testPassword,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();

      const { user, accessToken, refreshToken } = body.data;
      expect(user.fullName).toBe(testFullName);
      expect(user.phone).toBe(testPhone);
      expect(user.email).toBe(testEmail);
      expect(user.role).toBe("CUSTOMER");
      expect(user.passwordHash).toBeUndefined(); // Sensitive hash should not be exposed

      expect(typeof accessToken).toBe("string");
      expect(typeof refreshToken).toBe("string");

      customerUserId = user.id;
      customerAccessToken = accessToken;
      customerRefreshToken = refreshToken;
    });

    it("should reject duplicate registration with same phone or email", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: "Another Person",
          phone: testPhone,
          email: "unique_email@example.com",
          password: testPassword,
        }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("already exists");
    });

    it("should reject registration with invalid phone format", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: "Invalid Phone Person",
          phone: "invalid-phone",
          email: "invalid_phone@example.com",
          password: testPassword,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it("should reject registration with password shorter than 8 chars", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: "Short Password Person",
          phone: `+88019${Date.now().toString().slice(-6)}02`,
          password: "short",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  describe("2. Authentication Login (POST /auth/login)", () => {
    it("should authenticate customer using phone number", async () => {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: testPhone,
          password: testPassword,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.user.phone).toBe(testPhone);
      expect(body.data.user.role).toBe("CUSTOMER");
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();
    });

    it("should authenticate customer using email address", async () => {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: testEmail,
          password: testPassword,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe(testEmail);
      expect(body.data.user.role).toBe("CUSTOMER");
      expect(body.data.accessToken).toBeDefined();
    });

    it("should authenticate Super Admin seeded credentials", async () => {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "admin@myoxygen.com",
          password: "Admin@MyOxygen2026",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.user.role).toBe("SUPER_ADMIN");
      expect(body.data.accessToken).toBeDefined();

      superAdminAccessToken = body.data.accessToken;
    });

    it("should reject login with wrong password", async () => {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: testPhone,
          password: "WrongPassword!",
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe("Invalid credentials");
    });

    it("should reject login with unknown identifier", async () => {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "+8801999999999",
          password: "Password123!",
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Invalid credentials");
    });
  });

  describe("3. Token Verification & Identity Probe (/auth/me & /auth/refresh)", () => {
    it("should verify decoded JWT payload matches user properties", async () => {
      const payload = await verifyToken(customerAccessToken);
      expect(payload.sub).toBe(customerUserId);
      expect(payload.role).toBe("CUSTOMER");
      expect(payload.phone).toBe(testPhone);
      expect(payload.email).toBe(testEmail);
    });

    it("should return profile details for authenticated user on GET /auth/me", async () => {
      const res = await app.request("/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${customerAccessToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(customerUserId);
      expect(body.data.phone).toBe(testPhone);
      expect(body.data.role).toBe("CUSTOMER");
      expect(body.data.createdAt).toBeDefined();
    });

    it("should reject GET /auth/me without Authorization header", async () => {
      const res = await app.request("/auth/me", {
        method: "GET",
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe("Authorization token required");
    });

    it("should reject GET /auth/me with invalid or malformed token", async () => {
      const res = await app.request("/auth/me", {
        method: "GET",
        headers: {
          Authorization: "Bearer invalid-token-string",
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe("Invalid or expired authentication token");
    });

    it("should refresh access token using valid refresh token", async () => {
      const res = await app.request("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken: customerRefreshToken,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBeDefined();

      const newPayload = await verifyToken(body.data.accessToken);
      expect(newPayload.sub).toBe(customerUserId);
      expect(newPayload.role).toBe("CUSTOMER");
    });

    it("should reject refresh with invalid refresh token", async () => {
      const res = await app.request("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken: "invalid-refresh-token",
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe("Invalid or expired refresh token");
    });
  });

  describe("4. Granular RBAC Permission Matrix & Access Enforcement", () => {
    it("should reject Customer accessing stock adjust route (requires stock:adjust)", async () => {
      const res = await app.request("/admin/inventory/test", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${customerAccessToken}`,
        },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe(
        `Forbidden: Missing required permission [${Permissions.STOCK_ADJUST}]`,
      );
    });

    it("should reject Customer accessing refund approval route (requires refunds:approve)", async () => {
      const res = await app.request("/admin/orders/refund/test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${customerAccessToken}`,
        },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe(
        `Forbidden: Missing required permission [${Permissions.REFUNDS_APPROVE}]`,
      );
    });

    it("should grant Super Admin unrestricted access to stock adjust route", async () => {
      const res = await app.request("/admin/inventory/test", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${superAdminAccessToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe("Stock adjustment access granted");
    });

    it("should grant Super Admin unrestricted access to refund approval route", async () => {
      const res = await app.request("/admin/orders/refund/test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${superAdminAccessToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe("Refund approval access granted");
    });

    it("should verify RolePermissions matrix covers all expected operational roles", () => {
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

  describe("5. Security Headers & Rate Limiting", () => {
    it("should return required security headers on all responses", async () => {
      const res = await app.request("/health");

      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("X-XSS-Protection")).toBe("1; mode=block");
      expect(res.headers.get("Referrer-Policy")).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(res.headers.get("Strict-Transport-Security")).toContain(
        "max-age=31536000",
      );
    });

    it("should enforce rate limiting and return 429 with Retry-After header on threshold breach", async () => {
      resetRateLimiter();
      const testIp = "192.168.10.99";

      // 15 requests allowed by /auth/* limiter
      for (let i = 0; i < 15; i++) {
        const res = await app.request("/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": testIp,
          },
          body: JSON.stringify({
            identifier: "unknown@example.com",
            password: "WrongPassword123!",
          }),
        });
        expect(res.status).toBe(401);
      }

      // 16th request must trigger rate limiter (429)
      const blockedRes = await app.request("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": testIp,
        },
        body: JSON.stringify({
          identifier: "unknown@example.com",
          password: "WrongPassword123!",
        }),
      });

      expect(blockedRes.status).toBe(429);
      const retryAfter = blockedRes.headers.get("Retry-After");
      expect(retryAfter).toBeDefined();
      expect(Number(retryAfter)).toBeGreaterThan(0);

      const body = await blockedRes.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Too many requests");

      resetRateLimiter();
    }, 30000);
  });
});
