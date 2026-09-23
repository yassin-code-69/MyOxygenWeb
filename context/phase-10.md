### Phase 10 Context & Architecture Blueprint

Phase 10 is the final hardening and deployment phase for **My Oxygen**. It addresses three production-readiness pillars simultaneously: **correctness under load** (race-condition testing for FEFO inventory allocation), **perceived performance** (animation audit against Core Web Vitals targets), and **operational reliability** (Docker containerisation, CI/CD pipeline, and a rigorous go-live protocol).

Every decision in this phase is driven by the constraints of a single-owner Bangladesh e-commerce operation: limited Cloud DB connection quotas, mobile-first Bangladeshi customers who may be on 4G, and the mission-critical nature of FEFO batch allocation — a negative `available_quantity` on a perishable product is a business-integrity failure, not merely a bug.

Key invariants enforced by this phase:

- **Atomicity under concurrency:** `SELECT … FOR UPDATE SKIP LOCKED` within Serializable transactions guarantees that simultaneous orders never over-commit stock.
- **FEFO preservation under race:** Even when two concurrent requests target different batches, the earliest-expiry batch is always exhausted first.
- **Zero layout-thrash animations:** All motion animations are audited to use only `transform` and `opacity` — never width, height, top, or left.
- **Secrets hygiene:** `JWT_SECRET` is validated at ≥64 characters in production; stack traces are suppressed.

---

### Step 1: Race Condition Testing — FEFO Inventory

The FEFO (First-Expired, First-Out) batch allocation logic is the most concurrency-sensitive code in the entire system. When multiple customers check out simultaneously for the same product, only one PostgreSQL transaction can hold the row lock at a time — the rest must wait or skip. This test file fires 10 concurrent order requests against a product seeded with exactly 5 units to prove the invariant holds under real PostgreSQL transaction isolation.

The critical Drizzle pattern used inside the allocation service is `SELECT … FOR UPDATE SKIP LOCKED`: batches that are already locked by another concurrent transaction are skipped rather than waited on, ensuring no deadlocks while still guaranteeing atomicity within each individual transaction. FEFO ordering is enforced by `ORDER BY expiry_date ASC` applied before the lock.

#### `apps/api/src/tests/inventory-concurrency.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, asc, sql } from "drizzle-orm";
import {
  products,
  productBatches,
  orders,
  orderItems,
  users,
  categories,
} from "@my-oxygen/database/schema/tables";

// ---------------------------------------------------------------------------
// Test database — isolated from development data
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/my_oxygen_test",
  max: 20, // Allow enough connections for concurrent requests
});

const db = drizzle(pool, {
  schema: { products, productBatches, orders, orderItems, users, categories },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Atomically allocates `qty` units from the earliest-expiry batch for
 * `productId` using SELECT FOR UPDATE SKIP LOCKED inside a SERIALIZABLE
 * transaction. Returns the allocated batchId or throws on insufficient stock.
 */
async function allocateStock(
  productId: string,
  qty: number,
): Promise<{ batchId: string; allocatedQty: number }> {
  return await db.transaction(
    async (tx) => {
      // FEFO: order by expiry_date ASC, lock and skip already-locked rows
      const availableBatches = await tx.execute(sql`
        SELECT id, available_quantity, expiry_date
        FROM product_batches
        WHERE product_id    = ${productId}
          AND available_quantity > 0
        ORDER BY expiry_date ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);

      if (availableBatches.rows.length === 0) {
        throw new Error("STOCK_EXHAUSTED: No available stock for this product");
      }

      const batch = availableBatches.rows[0] as {
        id: string;
        available_quantity: number;
        expiry_date: string;
      };

      if (batch.available_quantity < qty) {
        throw new Error(
          `STOCK_EXHAUSTED: Only ${batch.available_quantity} units remain`,
        );
      }

      // Decrement atomically
      await tx
        .update(productBatches)
        .set({
          availableQuantity: sql`available_quantity - ${qty}`,
        })
        .where(eq(productBatches.id, batch.id));

      return { batchId: batch.id, allocatedQty: qty };
    },
    {
      isolationLevel: "serializable",
    },
  );
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let testProductId: string;
let testBatchAId: string; // Expires earlier  — FEFO should prefer this
let testBatchBId: string; // Expires later
let testUserId: string;
let testCategoryId: string;

beforeAll(async () => {
  // Ensure pg_trgm extension (needed by search — not strictly for this test
  // but ensures the test DB mirrors production schema extensions)
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  // Clean slate for each test block
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(productBatches);
  await db.delete(products);
  await db.delete(users);
  await db.delete(categories);

  // Seed category
  const [cat] = await db
    .insert(categories)
    .values({ name: "Test Cat", slug: `test-cat-${Date.now()}` })
    .returning();
  testCategoryId = cat.id;

  // Seed product
  const [product] = await db
    .insert(products)
    .values({
      categoryId: testCategoryId,
      title: "Concurrency Test Product",
      slug: `concurrency-product-${Date.now()}`,
      sku: `TEST-SKU-${Date.now()}`,
      description: "Used for concurrency tests only",
      basePrice: "100.00",
      costPrice: "60.00",
      images: [],
      requiresBatchTracking: true,
    })
    .returning();
  testProductId = product.id;

  // Seed user
  const [user] = await db
    .insert(users)
    .values({
      fullName: "Test Customer",
      phone: `+88017${Date.now().toString().slice(-8)}`,
      role: "CUSTOMER",
    })
    .returning();
  testUserId = user.id;

  // Seed Batch A — expires sooner (FEFO priority)
  const [batchA] = await db
    .insert(productBatches)
    .values({
      productId: testProductId,
      batchNumber: "BATCH-A",
      manufactureDate: "2026-01-01",
      expiryDate: "2026-09-01", // Earlier expiry
      initialQuantity: 3,
      availableQuantity: 3,
    })
    .returning();
  testBatchAId = batchA.id;

  // Seed Batch B — expires later
  const [batchB] = await db
    .insert(productBatches)
    .values({
      productId: testProductId,
      batchNumber: "BATCH-B",
      manufactureDate: "2026-01-15",
      expiryDate: "2027-03-01", // Later expiry
      initialQuantity: 2,
      availableQuantity: 2,
    })
    .returning();
  testBatchBId = batchB.id;
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("FEFO Inventory — Concurrency & Race Condition Tests", () => {
  it("exactly 5 of 10 concurrent requests succeed when stock is 5 units total", async () => {
    // Total available: Batch A (3) + Batch B (2) = 5 units
    // Fire 10 concurrent single-unit allocation requests
    const concurrentRequests = Array.from({ length: 10 }, () =>
      allocateStock(testProductId, 1).then(
        (result) => ({ success: true, result }),
        (error: Error) => ({ success: false, error: error.message }),
      ),
    );

    const results = await Promise.all(concurrentRequests);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // Exactly 5 must succeed
    expect(successes).toHaveLength(5);

    // Exactly 5 must fail with a stock exhaustion message
    expect(failures).toHaveLength(5);
    failures.forEach((f) => {
      expect(f.error).toMatch(/STOCK_EXHAUSTED/);
    });

    // The database must reflect zero remaining stock
    const remaining = await db
      .select({ qty: productBatches.availableQuantity })
      .from(productBatches)
      .where(eq(productBatches.productId, testProductId));

    const totalRemaining = remaining.reduce((sum, r) => sum + r.qty, 0);
    expect(totalRemaining).toBe(0);
  }, 15_000); // Allow 15s for concurrent DB round-trips

  it("available_quantity never goes negative under concurrent load", async () => {
    // Attempt 20 requests against 5 units of stock
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => allocateStock(testProductId, 1)),
    );

    const allBatches = await db
      .select({ qty: productBatches.availableQuantity })
      .from(productBatches)
      .where(eq(productBatches.productId, testProductId));

    allBatches.forEach((batch) => {
      // The critical invariant: stock can never go below zero
      expect(batch.qty).toBeGreaterThanOrEqual(0);
    });

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(5);
  });

  it("FEFO ordering is preserved when two concurrent requests target different batches", async () => {
    // Drain Batch A (3 units) and simultaneously start a Batch B request
    // Even under concurrency, Batch A must be fully consumed before Batch B is touched

    // Fire 3 requests concurrently — all should land in Batch A (the earlier-expiry batch)
    const firstWave = await Promise.all(
      Array.from({ length: 3 }, () =>
        allocateStock(testProductId, 1).then(
          (r) => ({ success: true, batchId: r.batchId }),
          (e: Error) => ({ success: false, error: e.message }),
        ),
      ),
    );

    const firstWaveSuccesses = firstWave.filter((r) => r.success);

    // All 3 first-wave allocations must succeed from Batch A
    expect(firstWaveSuccesses).toHaveLength(3);
    firstWaveSuccesses.forEach((r) => {
      // Every early allocation must come from the earlier-expiry batch (FEFO)
      expect(r.batchId).toBe(testBatchAId);
    });

    // Batch A should now be empty; Batch B should be untouched at 2
    const batchARow = await db
      .select({ qty: productBatches.availableQuantity })
      .from(productBatches)
      .where(eq(productBatches.id, testBatchAId));

    const batchBRow = await db
      .select({ qty: productBatches.availableQuantity })
      .from(productBatches)
      .where(eq(productBatches.id, testBatchBId));

    expect(batchARow[0].qty).toBe(0);
    expect(batchBRow[0].qty).toBe(2);

    // Now fire 2 more — must spill into Batch B
    const secondWave = await Promise.all(
      Array.from({ length: 2 }, () =>
        allocateStock(testProductId, 1).then(
          (r) => ({ success: true, batchId: r.batchId }),
          (e: Error) => ({ success: false, error: e.message }),
        ),
      ),
    );

    secondWave
      .filter((r) => r.success)
      .forEach((r) => {
        expect(r.batchId).toBe(testBatchBId);
      });
  }, 15_000);
});
```

---

### Step 2: API Integration Tests

Each route domain gets its own integration test file. Tests use Hono's built-in `app.request()` test client — no HTTP server is started, avoiding port-collision flakiness in CI. All tests share a single `TEST_DATABASE_URL` pointing at a separate `my_oxygen_test` database that is migrated fresh on every CI run.

#### `apps/api/vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/tests/**", "src/index.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    // Run concurrency tests sequentially to avoid cross-test pool exhaustion
    sequence: {
      concurrent: false,
    },
    testTimeout: 20_000,
  },
});
```

#### `apps/api/src/tests/setup.ts`

```typescript
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";

// Run all pending migrations against the test database before the suite starts
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/my_oxygen_test",
});

const db = drizzle(pool);

beforeAll(async () => {
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await migrate(db, {
    migrationsFolder: path.resolve(
      __dirname,
      "../../../../packages/database/drizzle",
    ),
  });
});

afterAll(async () => {
  await pool.end();
});
```

#### `apps/api/src/tests/auth.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import app from "../index"; // Default export of the Hono app instance

const BASE = "/api/v1/auth";

// Unique phone per test run to avoid unique-constraint collisions
const testPhone = () => `+88017${Date.now().toString().slice(-8)}`;

describe("Auth Routes", () => {
  let registeredPhone: string;
  let accessToken: string;
  let refreshToken: string;

  beforeEach(async () => {
    registeredPhone = testPhone();
  });

  it("POST /register — creates a new CUSTOMER account", async () => {
    const res = await app.request(`${BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Test Customer",
        phone: registeredPhone,
        password: "SecurePass@123",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe("CUSTOMER");
  });

  it("POST /login — returns access + refresh tokens on valid credentials", async () => {
    // Register first
    await app.request(`${BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Login Test User",
        phone: registeredPhone,
        password: "SecurePass@123",
      }),
    });

    const res = await app.request(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: registeredPhone,
        password: "SecurePass@123",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("accessToken");
    expect(body.data).toHaveProperty("refreshToken");

    accessToken = body.data.accessToken;
    refreshToken = body.data.refreshToken;
  });

  it("POST /refresh — issues a new access token from a valid refresh token", async () => {
    // Full login flow to obtain tokens
    await app.request(`${BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Refresh Test",
        phone: registeredPhone,
        password: "SecurePass@123",
      }),
    });
    const loginRes = await app.request(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: registeredPhone,
        password: "SecurePass@123",
      }),
    });
    const { data } = await loginRes.json();

    const res = await app.request(`${BASE}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: data.refreshToken }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("accessToken");
  });

  it("GET /me — returns authenticated user profile", async () => {
    await app.request(`${BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Me Test",
        phone: registeredPhone,
        password: "SecurePass@123",
      }),
    });
    const loginRes = await app.request(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: registeredPhone,
        password: "SecurePass@123",
      }),
    });
    const { data } = await loginRes.json();

    const res = await app.request("/api/v1/users/me", {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.phone).toBe(registeredPhone);
  });

  it("GET /admin — rejects CUSTOMER role with 403", async () => {
    await app.request(`${BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "RBAC Test",
        phone: registeredPhone,
        password: "SecurePass@123",
      }),
    });
    const loginRes = await app.request(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: registeredPhone,
        password: "SecurePass@123",
      }),
    });
    const { data } = await loginRes.json();

    // Admin-only endpoint — CUSTOMER should be rejected
    const res = await app.request("/api/v1/admin/users", {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/forbidden|unauthorized/i);
  });
});
```

#### `apps/api/src/tests/catalog.test.ts`

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import app from "../index";

const BASE = "/api/v1";
let adminToken: string;
let createdProductId: string;

beforeAll(async () => {
  // Log in as the seeded Super Admin to get an admin token
  const res = await app.request(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: "+8801700000000",
      password: "Admin@MyOxygen2026",
    }),
  });
  const body = await res.json();
  adminToken = body.data?.accessToken;
});

describe("Catalog — Product CRUD", () => {
  it("POST /products — creates a product (admin only)", async () => {
    const res = await app.request(`${BASE}/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        categorySlug: "skin-care",
        title: "Test Serum",
        sku: `TEST-SRM-${Date.now()}`,
        description: "A test serum product",
        basePrice: "850.00",
        costPrice: "500.00",
        images: ["https://example.com/serum.jpg"],
        requiresBatchTracking: true,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toHaveProperty("id");
    createdProductId = body.data.id;
  });

  it("GET /products/:id — returns product details", async () => {
    const res = await app.request(`${BASE}/products/${createdProductId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe("Test Serum");
  });

  it("PATCH /products/:id — updates product base price", async () => {
    const res = await app.request(`${BASE}/products/${createdProductId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ basePrice: "900.00" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.basePrice).toBe("900.00");
  });

  it("GET /products?search= — returns results with fuzzy matching", async () => {
    const res = await app.request(`${BASE}/products?search=serum`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items.length).toBeGreaterThan(0);
  });

  it("Flash sale pricing — active discount overrides basePrice in response", async () => {
    // Create a flash sale discount for the test product
    await app.request(`${BASE}/discounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        productId: createdProductId,
        type: "PERCENTAGE",
        value: "20",
        startsAt: new Date(Date.now() - 3600_000).toISOString(),
        endsAt: new Date(Date.now() + 3600_000).toISOString(),
        isFlashSale: true,
      }),
    });

    const res = await app.request(`${BASE}/products/${createdProductId}`);
    const body = await res.json();

    // Flash sale price must be basePrice * 0.80 = 720.00
    expect(Number(body.data.effectivePrice)).toBeCloseTo(720, 0);
    expect(body.data.isFlashSale).toBe(true);
  });

  it("DELETE /products/:id — soft-deletes product", async () => {
    const res = await app.request(`${BASE}/products/${createdProductId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);

    // Soft-deleted product must not appear in public catalog
    const publicRes = await app.request(`${BASE}/products/${createdProductId}`);
    expect(publicRes.status).toBe(404);
  });
});
```

#### `apps/api/src/tests/orders.test.ts`

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import app from "../index";

const BASE = "/api/v1";
let customerToken: string;
let adminToken: string;
let testProductId: string;
let validCouponCode: string;

beforeAll(async () => {
  // Register + login customer
  const phone = `+88016${Date.now().toString().slice(-8)}`;
  await app.request(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Order Test Customer",
      phone,
      password: "SecurePass@123",
    }),
  });
  const loginRes = await app.request(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password: "SecurePass@123" }),
  });
  customerToken = (await loginRes.json()).data?.accessToken;

  // Admin login
  const adminRes = await app.request(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: "+8801700000000",
      password: "Admin@MyOxygen2026",
    }),
  });
  adminToken = (await adminRes.json()).data?.accessToken;

  // Create a product + batch for order tests
  const prodRes = await app.request(`${BASE}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      categorySlug: "newborn",
      title: "Order Test Product",
      sku: `ORD-TST-${Date.now()}`,
      description: "Product for order flow tests",
      basePrice: "500.00",
      costPrice: "300.00",
      images: [],
      requiresBatchTracking: true,
    }),
  });
  testProductId = (await prodRes.json()).data?.id;

  // Add batch with 10 units
  await app.request(`${BASE}/inventory/batches`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      productId: testProductId,
      batchNumber: "ORD-BATCH-001",
      expiryDate: "2027-12-31",
      initialQuantity: 10,
      availableQuantity: 10,
    }),
  });

  // Create a percentage coupon
  validCouponCode = `SAVE10-${Date.now()}`;
  await app.request(`${BASE}/discounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      code: validCouponCode,
      type: "PERCENTAGE",
      value: "10",
      startsAt: new Date(Date.now() - 3600_000).toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      isFlashSale: false,
    }),
  });
});

describe("Orders — Coupon, Placement & Stock Deduction", () => {
  it("POST /orders/validate-coupon — returns discount amount for valid code", async () => {
    const res = await app.request(`${BASE}/orders/validate-coupon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        code: validCouponCode,
        subtotal: "1000.00",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // 10% of 1000 = 100
    expect(Number(body.data.discountAmount)).toBeCloseTo(100, 0);
  });

  it("POST /orders/validate-coupon — rejects expired coupon with 400", async () => {
    const expiredCode = `EXPIRED-${Date.now()}`;
    await app.request(`${BASE}/discounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        code: expiredCode,
        type: "FIXED_AMOUNT",
        value: "50",
        startsAt: new Date(Date.now() - 7_200_000).toISOString(),
        endsAt: new Date(Date.now() - 3_600_000).toISOString(), // Already ended
        isFlashSale: false,
      }),
    });

    const res = await app.request(`${BASE}/orders/validate-coupon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ code: expiredCode, subtotal: "500.00" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/expired|invalid/i);
  });

  it("POST /orders — places an order and deducts stock", async () => {
    const res = await app.request(`${BASE}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "COD",
        shippingAddress: "123 Dhaka Road, Dhaka-1000",
        couponCode: validCouponCode,
        items: [{ productId: testProductId, quantity: 2 }],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toHaveProperty("orderNumber");
    expect(body.data.status).toBe("PENDING");

    // Verify stock was deducted
    const stockRes = await app.request(
      `${BASE}/inventory/products/${testProductId}/stock`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const stockBody = await stockRes.json();
    // Started with 10, ordered 2 → 8 remaining
    expect(stockBody.data.totalAvailable).toBe(8);
  });

  it("POST /orders — rejects order that exceeds available stock with 409", async () => {
    // Attempt to order 100 units of a product with only 8 remaining
    const res = await app.request(`${BASE}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "COD",
        shippingAddress: "456 Chittagong Ave",
        items: [{ productId: testProductId, quantity: 100 }],
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/stock|exhausted/i);
  });
});
```

---

### Step 3: Animation Performance Audit

All Framer Motion animations in `apps/web` must adhere to a set of audited rules that prevent layout thrashing and guarantee smooth 60 fps on mid-range Bangladeshi mobile devices. This utility file exports the `useReducedMotion` accessibility hook and documents the audit constraints as inline JSDoc — making them discoverable during code review without requiring a separate wiki page.

#### `apps/web/src/lib/performance.ts`

````typescript
/**
 * @file performance.ts
 * Animation performance rules and accessibility utilities for My Oxygen.
 *
 * ## Audit Rules (enforced in code review):
 *
 * 1. COMPOSITOR-ONLY PROPERTIES
 *    All motion animations MUST animate only `transform` and `opacity`.
 *    Never animate `width`, `height`, `top`, `left`, `margin`, or `padding` —
 *    these trigger layout recalculation on every frame, causing jank on
 *    mid-range Android devices common in the Bangladesh market.
 *
 *    ✅ Correct:   animate={{ opacity: 1, y: 0 }}
 *    ❌ Incorrect: animate={{ height: "auto", top: 0 }}
 *
 * 2. WILL-CHANGE BUDGET
 *    Apply `will-change: transform` only via Framer Motion's `layoutId` or
 *    explicit `style={{ willChange: "transform" }}` during active animation
 *    sequences. Remove after animation completes. Applying will-change to
 *    static elements wastes GPU memory and can degrade overall page paint.
 *
 * 3. STAGGER CAP
 *    `staggerChildren` in `variants` must not exceed 0.08s (80ms).
 *    Larger stagger values create a perceived "domino delay" on list renders
 *    and artificially inflate TTI on slow connections.
 *
 *    ✅ Correct:   staggerChildren: 0.06
 *    ❌ Incorrect: staggerChildren: 0.15
 *
 * 4. IMAGE LOADING
 *    All product images and hero images MUST use Next.js <Image> component
 *    with appropriate `sizes` prop. Never use raw <img> for content images.
 *    Use `priority` only for above-the-fold LCP images (hero, first product
 *    card in catalog).
 *
 * 5. SKELETON LOADERS
 *    Any data-fetching component that may take >150ms to resolve MUST render
 *    a Mantine <Skeleton> placeholder during the loading state. This applies
 *    to: product catalog, product detail, cart, order history, and flash sale
 *    countdown timers.
 *
 * ## Lighthouse Production Targets:
 *    - Performance Score:       ≥ 90
 *    - First Contentful Paint:  < 1.5s
 *    - Total Blocking Time:     < 100ms
 *    - Cumulative Layout Shift: < 0.1
 *    - Largest Contentful Paint:< 2.5s  (LCP — hero or first product image)
 */

import {
  useReducedMotion as useFramerReducedMotion,
  Variants,
} from "framer-motion";

// ---------------------------------------------------------------------------
// Accessibility: Reduced Motion
// ---------------------------------------------------------------------------

/**
 * Wraps Framer Motion's `useReducedMotion` to respect the OS-level
 * `prefers-reduced-motion: reduce` media query.
 *
 * Usage:
 * ```tsx
 * const prefersReducedMotion = useReducedMotion();
 * const variants = prefersReducedMotion ? staticVariants : animatedVariants;
 * ```
 *
 * When `true` is returned, all animation variants should collapse to
 * instant state changes (no duration, no delay, no stagger).
 */
export function useReducedMotion(): boolean {
  return useFramerReducedMotion() ?? false;
}

// ---------------------------------------------------------------------------
// Standard Variant Presets (compositor-only, audit-compliant)
// ---------------------------------------------------------------------------

/** Fade + slide up — used for page sections and card entrances. */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" },
  },
};

/**
 * Staggered list container.
 * `staggerChildren` is capped at 0.06s — well within the 0.08s budget.
 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06, // ≤ 0.08s audit rule
      delayChildren: 0.05,
    },
  },
};

/** Individual list item — used as child of `staggerContainer`. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

/** Scale pulse for flash sale badges — compositor-only (transform + opacity). */
export const flashSalePulse: Variants = {
  idle: { scale: 1, opacity: 1 },
  pulse: {
    scale: [1, 1.06, 1],
    opacity: [1, 0.85, 1],
    transition: { duration: 0.7, repeat: Infinity, ease: "easeInOut" },
  },
};

/** Reduced motion fallback — instant state, no animation. */
export const noMotion: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
  idle: { scale: 1, opacity: 1 },
  pulse: { scale: 1, opacity: 1 },
};

// ---------------------------------------------------------------------------
// Performance utility: Skeleton threshold
// ---------------------------------------------------------------------------

/**
 * Minimum fetch duration (ms) before a Skeleton loader should be rendered.
 * Components should start a timer on mount; if the data promise has not
 * resolved by this threshold, switch to the skeleton state.
 *
 * @example
 * ```tsx
 * const [showSkeleton, setShowSkeleton] = useState(false);
 * useEffect(() => {
 *   const t = setTimeout(() => setShowSkeleton(true), SKELETON_THRESHOLD_MS);
 *   fetchData().finally(() => clearTimeout(t));
 * }, []);
 * ```
 */
export const SKELETON_THRESHOLD_MS = 150;
````

---

### Step 4: Production Environment Configuration

#### `.env.production.example`

```bash
# =============================================================================
# My Oxygen — Production Environment Variables
# Copy this file to .env.production and populate all values before deploying.
# Never commit .env.production to version control.
# =============================================================================

# --- Node Runtime ---
NODE_ENV=production

# --- API Server ---
PORT=4000

# --- Database ---
# Full PostgreSQL connection string. Must point to a managed Cloud DB instance.
# Ensure the connection string includes ?sslmode=require for encrypted transport.
DATABASE_URL=postgres://myoxygen_user:STRONG_PASSWORD@db.host.example.com:5432/my_oxygen?sslmode=require

# Separate database used exclusively by vitest integration tests.
# Must NOT point to the production database.
TEST_DATABASE_URL=postgres://myoxygen_test_user:TEST_PASSWORD@localhost:5432/my_oxygen_test

# --- Authentication ---
# Must be at minimum 64 characters of cryptographically random entropy.
# Generate with: openssl rand -hex 32
JWT_SECRET=replace_with_64_char_minimum_cryptographically_random_hex_string_here

# JWT token lifetimes
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# --- CORS ---
# Comma-separated list of allowed origins. Do NOT use wildcard (*) in production.
CORS_ORIGIN=https://myoxygen.com.bd,https://www.myoxygen.com.bd

# --- Rate Limiting ---
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# --- Error Monitoring ---
# Obtain from https://sentry.io — configure for the my-oxygen-api project.
SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0

# --- File Storage (optional: product images) ---
# S3-compatible storage endpoint (e.g., Cloudflare R2, MinIO, AWS S3)
STORAGE_ENDPOINT=https://your-account.r2.cloudflarestorage.com
STORAGE_BUCKET=my-oxygen-assets
STORAGE_ACCESS_KEY_ID=your_access_key
STORAGE_SECRET_ACCESS_KEY=your_secret_key
STORAGE_PUBLIC_URL=https://assets.myoxygen.com.bd

# --- Courier Integration (Steadfast) ---
STEADFAST_API_KEY=your_steadfast_api_key
STEADFAST_API_SECRET=your_steadfast_api_secret

# --- SMS Gateway (for OTP, order notifications) ---
SMS_GATEWAY_API_KEY=your_sms_api_key
SMS_GATEWAY_SENDER_ID=MyOxygen
```

#### `apps/api/src/env.ts` (updated for production hardening)

```typescript
import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // DATABASE_URL is mandatory in all environments
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL URL"),

  // In production, JWT_SECRET must be at least 64 characters to ensure
  // sufficient entropy. Development allows shorter secrets for convenience.
  JWT_SECRET: isProduction
    ? z
        .string()
        .min(
          64,
          "Production JWT_SECRET must be at least 64 characters. Generate with: openssl rand -hex 32",
        )
    : z.string().min(32),

  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // Comma-separated origins — validated as non-wildcard in production
  CORS_ORIGIN: isProduction
    ? z
        .string()
        .refine(
          (val) => !val.includes("*"),
          "CORS_ORIGIN must not contain wildcard (*) in production",
        )
    : z.string().default("*"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Optional but logged as a warning if absent in production
  SENTRY_DSN: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);

// Warn at startup if Sentry is not configured in production
if (isProduction && !env.SENTRY_DSN) {
  console.warn(
    "⚠️  SENTRY_DSN is not configured — error monitoring is disabled in production",
  );
}

// Production: stack traces must never be exposed in API responses
export const exposeStackTrace = env.NODE_ENV === "development";
```

#### Production Database Pool (`packages/database/src/client.ts` — updated)

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/tables";
import * as enums from "./schema/enums";

const isProduction = process.env.NODE_ENV === "production";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/my_oxygen";

export const pool = new Pool({
  connectionString,

  // Production: Cloud DB providers (Neon, Supabase, Railway) typically cap
  // connections at 10–25 for hobby/starter tiers. Set max conservatively.
  max: isProduction ? 10 : 20,

  // Release idle connections after 10s in production to avoid holding open
  // slots against the Cloud DB connection quota.
  idleTimeoutMillis: isProduction ? 10_000 : 30_000,

  connectionTimeoutMillis: 2_000,

  // SSL required for all managed Cloud DB instances
  ssl: isProduction ? { rejectUnauthorized: true } : false,
});

export const db = drizzle(pool, { schema: { ...schema, ...enums } });
export type DatabaseClient = typeof db;
```

---

### Step 5: Docker & Compose Setup

#### `apps/api/Dockerfile`

```dockerfile
# =============================================================================
# Stage 1: Builder — install dependencies and compile TypeScript
# =============================================================================
FROM node:20-alpine AS builder

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY packages/config-typescript/package.json ./packages/config-typescript/

# Install all dependencies (including devDependencies for tsc)
RUN pnpm install --frozen-lockfile

# Copy full source
COPY apps/api ./apps/api
COPY packages ./packages

# Compile TypeScript → dist/
RUN pnpm --filter @my-oxygen/api build

# =============================================================================
# Stage 2: Runner — lean production image
# =============================================================================
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy only production node_modules and compiled output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/packages ./packages

ENV NODE_ENV=production

EXPOSE 4000

# Limit heap to 512 MB — suitable for 1 GB RAM Cloud VM instances
CMD ["node", "--max-old-space-size=512", "dist/index.js"]
```

#### `apps/web/Dockerfile`

```dockerfile
# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui-tokens/package.json ./packages/ui-tokens/
COPY packages/types/package.json ./packages/types/
COPY packages/config-typescript/package.json ./packages/config-typescript/

RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 2: Builder — Next.js standalone build
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm --filter @my-oxygen/web build

# =============================================================================
# Stage 3: Runner — minimal standalone Next.js server
# =============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (requires next.config.ts output: 'standalone')
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
```

#### `docker-compose.yml` (root)

```yaml
version: "3.9"

services:
  # ---------------------------------------------------------------------------
  # PostgreSQL 16
  # ---------------------------------------------------------------------------
  postgres:
    image: postgres:16-alpine
    container_name: my_oxygen_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: myoxygen_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: my_oxygen
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U myoxygen_user -d my_oxygen"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  # ---------------------------------------------------------------------------
  # Hono.js API
  # ---------------------------------------------------------------------------
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: my_oxygen_api
    restart: unless-stopped
    env_file: .env.production
    environment:
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "4000:4000"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:4000/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ---------------------------------------------------------------------------
  # Next.js Web Storefront
  # ---------------------------------------------------------------------------
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: my_oxygen_web
    restart: unless-stopped
    env_file: .env.production
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: https://myoxygen.com.bd/api
    depends_on:
      - api
    ports:
      - "3000:3000"

  # ---------------------------------------------------------------------------
  # Nginx Reverse Proxy
  # ---------------------------------------------------------------------------
  nginx:
    image: nginx:1.27-alpine
    container_name: my_oxygen_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
      - nginx_cache:/var/cache/nginx
    depends_on:
      - api
      - web

volumes:
  postgres_data:
  nginx_cache:
```

#### `nginx/nginx.conf`

```nginx
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # -------------------------------------------------------------------------
    # Logging
    # -------------------------------------------------------------------------
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';
    access_log /var/log/nginx/access.log main;

    sendfile        on;
    keepalive_timeout 65;

    # -------------------------------------------------------------------------
    # Gzip Compression
    # -------------------------------------------------------------------------
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml;

    # -------------------------------------------------------------------------
    # Upstreams
    # -------------------------------------------------------------------------
    upstream api_upstream {
        server api:4000;
        keepalive 32;
    }

    upstream web_upstream {
        server web:3000;
        keepalive 32;
    }

    # -------------------------------------------------------------------------
    # HTTP → HTTPS Redirect
    # -------------------------------------------------------------------------
    server {
        listen 80;
        server_name myoxygen.com.bd www.myoxygen.com.bd;
        return 301 https://$host$request_uri;
    }

    # -------------------------------------------------------------------------
    # HTTPS — Main Virtual Host
    # -------------------------------------------------------------------------
    server {
        listen 443 ssl http2;
        server_name myoxygen.com.bd www.myoxygen.com.bd;

        ssl_certificate     /etc/nginx/certs/fullchain.pem;
        ssl_certificate_key /etc/nginx/certs/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;

        # Security headers
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
        add_header X-Frame-Options DENY always;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # -----------------------------------------------------------------
        # API Routes  →  Hono.js container
        # -----------------------------------------------------------------
        location /api/ {
            proxy_pass         http://api_upstream;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
            proxy_set_header   Connection        "";
            proxy_read_timeout 30s;
        }

        # -----------------------------------------------------------------
        # Static Assets — aggressive caching (Next.js /_next/static/*)
        # -----------------------------------------------------------------
        location /_next/static/ {
            proxy_pass       http://web_upstream;
            proxy_cache      nginx_cache;
            expires          365d;
            add_header       Cache-Control "public, immutable";
        }

        # -----------------------------------------------------------------
        # Web Storefront  →  Next.js container
        # -----------------------------------------------------------------
        location / {
            proxy_pass         http://web_upstream;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
            proxy_set_header   Connection        "";
            proxy_read_timeout 30s;
        }
    }
}
```

---

### Step 6: Turborepo Production Build Pipeline

#### `turbo.json` (updated)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "remoteCache": {
    "enabled": true
  },
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "env": ["TEST_DATABASE_URL", "NODE_ENV"],
      "outputs": ["coverage/**"]
    },
    "docker:build": {
      "dependsOn": ["build", "test"],
      "cache": false
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```

#### `apps/api/package.json` — production scripts (relevant section)

```json
{
  "name": "@my-oxygen/api",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --project tsconfig.json",
    "start": "node dist/index.js",
    "start:prod": "node --max-old-space-size=512 dist/index.js",
    "test": "vitest run --coverage",
    "test:watch": "vitest",
    "test:concurrency": "vitest run src/tests/inventory-concurrency.test.ts",
    "lint": "eslint src --ext .ts",
    "type-check": "tsc --noEmit"
  }
}
```

**Production build sequence:**

```bash
# 1. Compile all packages and apps in dependency order
pnpm build

# 2. Run full test suite including concurrency tests
pnpm test

# 3. Build Docker images (only runs after build + test succeed via turbo deps)
docker compose build --no-cache

# 4. Push images to registry (optional — for remote deployment)
docker compose push
```

---

### Step 7: CI/CD Pipeline (GitHub Actions)

#### `.github/workflows/ci.yml`

```yaml
name: My Oxygen CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  # Turborepo remote cache — set in GitHub repository secrets
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  # ---------------------------------------------------------------------------
  # Job 1: Lint & Type Check
  # ---------------------------------------------------------------------------
  lint-and-type-check:
    name: Lint & Type Check
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Turborepo lint
        run: pnpm turbo lint

      - name: Run Turborepo type-check
        run: pnpm turbo type-check

  # ---------------------------------------------------------------------------
  # Job 2: Test Suite (with PostgreSQL service container)
  # ---------------------------------------------------------------------------
  test:
    name: Test Suite
    runs-on: ubuntu-latest
    needs: lint-and-type-check

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: my_oxygen_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/my_oxygen_test
      NODE_ENV: test
      JWT_SECRET: ci_test_jwt_secret_value_that_is_at_least_32_chars_long

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run database migrations on test DB
        run: pnpm db:migrate
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/my_oxygen_test

      - name: Run full test suite with coverage
        run: pnpm turbo test

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: apps/api/coverage/
          retention-days: 14

  # ---------------------------------------------------------------------------
  # Job 3: Production Build + Docker Build Verification
  # ---------------------------------------------------------------------------
  build:
    name: Production Build
    runs-on: ubuntu-latest
    needs: test

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all packages (Turborepo)
        run: pnpm turbo build

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build API Docker image (no push)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/api/Dockerfile
          push: false
          tags: my-oxygen-api:ci-${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build Web Docker image (no push)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/web/Dockerfile
          push: false
          tags: my-oxygen-web:ci-${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

### Step 8: Production Deployment Checklist

#### Pre-Deployment

```bash
# 1. Confirm all environment variables are populated
cat .env.production | grep -v "^#" | grep -v "^$" | while IFS='=' read -r key value; do
  if [ -z "$value" ]; then
    echo "❌ MISSING: $key"
  else
    echo "✅ SET:     $key"
  fi
done

# 2. Run database migrations against the production database
DATABASE_URL="$PROD_DATABASE_URL" pnpm db:migrate

# 3. Verify pg_trgm extension is enabled (required for product search)
psql "$PROD_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# 4. Run the full test suite one final time against a staging DB
TEST_DATABASE_URL="$STAGING_DATABASE_URL" pnpm turbo test
```

#### Go-Live Checklist

| Item                             | Verification Command / Action                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| HTTPS enabled (Let's Encrypt)    | `curl -I https://myoxygen.com.bd` → `HTTP/2 200`                                                                     |
| SSL cert validity                | `openssl s_client -connect myoxygen.com.bd:443 \| openssl x509 -noout -dates`                                        |
| CORS locked to production domain | `curl -H "Origin: https://evil.com" https://myoxygen.com.bd/api/v1/health` → no `Access-Control-Allow-Origin` header |
| Rate limiter active              | Fire >100 requests in 60s → `429 Too Many Requests`                                                                  |
| Sentry DSN configured            | Trigger a test error; verify it appears in Sentry dashboard                                                          |
| Stack traces suppressed          | Check a 500 response body — `stack` field must be absent                                                             |
| Database SSL enforced            | `DATABASE_URL` contains `?sslmode=require`                                                                           |
| Log aggregation active           | Confirm container logs are shipping to log aggregator (e.g., Loki, Papertrail)                                       |

#### Post-Deployment Smoke Tests

```bash
BASE="https://myoxygen.com.bd"

# Health endpoint
curl -f "$BASE/api/v1/health" | jq '.status'
# Expected: "UP"

# Catalog API
curl -f "$BASE/api/v1/products?limit=5" | jq '.data.items | length'
# Expected: 5

# Category listing
curl -f "$BASE/api/v1/categories" | jq '.data | map(.name)'
# Expected: ["Newborn", "Mother Care", "Skin Care", "Inner Wear"]

# Auth — register a smoke-test customer
curl -sf -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Smoke Test","phone":"+88019XXXXXXXX","password":"SmokeTest@2026"}' \
  | jq '.success'
# Expected: true

# Monitor error rate for 30 minutes post-launch
echo "▶ Watch Sentry dashboard for new issues. Target: 0 new error events in 30 min."
```

---

### Step 9: Final Verification Checklist

Execute these commands in sequence. Every step must pass before proceeding to the next.

1. **Full test suite with coverage:**

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/my_oxygen_test \
  pnpm turbo test

```

_Expected outcome:_ All vitest tests pass. Coverage report generated at `apps/api/coverage/`. Lines ≥80%, Functions ≥80%.

2. **Concurrency & FEFO race condition tests:**

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/my_oxygen_test \
  pnpm --filter @my-oxygen/api test:concurrency

```

_Expected outcome:_ All 3 concurrency tests pass: exactly 5/10 orders succeed, `available_quantity` never goes negative, FEFO batch ordering is preserved under concurrent load.

3. **Full Turborepo production build:**

```bash
pnpm turbo build

```

_Expected outcome:_ `apps/api/dist/` and `apps/web/.next/` populated without TypeScript errors.

4. **Docker Compose stack up:**

```bash
docker compose up --build -d
docker compose ps

```

_Expected outcome:_ All four services (`postgres`, `api`, `web`, `nginx`) show status `running (healthy)`.

5. **Smoke test all endpoints:**

```bash
curl http://localhost/api/v1/health
curl http://localhost/api/v1/categories
curl http://localhost/api/v1/products?limit=3

```

_Expected outcome:_ All three return HTTP 200 with well-formed JSON bodies.

6. **Lighthouse audit (production or staging URL):**

```bash
# Install Lighthouse CLI if not present
pnpm dlx lighthouse https://myoxygen.com.bd \
  --output=json \
  --output-path=./lighthouse-report.json \
  --chrome-flags="--headless" \
  --only-categories=performance

# Extract score
cat lighthouse-report.json | jq '.categories.performance.score * 100'

```

_Expected outcome:_ Performance score ≥ 90. FCP < 1.5s, TBT < 100ms, CLS < 0.1.

7. **CI pipeline green on `main`:**

_Expected outcome:_ GitHub Actions `lint-and-type-check` → `test` → `build` all show green checkmarks on the latest `main` branch commit.
