import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { products } from "../db/schema/tables";
import { addDays, todayInBusinessTz } from "../lib/dates";
import type { BrandDTO } from "../services/brand.service";
import type { AdminCategoryDTO } from "../services/category.service";
import { call, dhakaTime, ManagementFixtures, RUN, type TestUser } from "../tests/management-fixtures";

const fixtures = new ManagementFixtures("meta");
const CATEGORIES = "/admin/catalog/categories";
const BRANDS = "/admin/catalog/brands";

let admin: TestUser;
let inventory: TestUser;
let marketing: TestUser;
let buyer: TestUser;

beforeAll(async () => {
  admin = await fixtures.user("SUPER_ADMIN");
  inventory = await fixtures.user("INVENTORY_MANAGER");
  marketing = await fixtures.user("MARKETING_MANAGER");
  buyer = await fixtures.user("CUSTOMER");
});

afterAll(async () => {
  await fixtures.cleanup();
});

async function createCategory(body: Record<string, unknown>, token = inventory.token) {
  const res = await call<AdminCategoryDTO>("POST", CATEGORIES, { token, body });
  if (res.status === 201) fixtures.trackCategory(res.body.data.id);
  return res;
}

async function listCategories(): Promise<AdminCategoryDTO[]> {
  const res = await call<AdminCategoryDTO[]>("GET", CATEGORIES, { token: marketing.token });
  expect(res.status).toBe(200);
  return res.body.data;
}

describe("categories: create", () => {
  it("auto-generates a kebab-case slug from the name and returns 201 with zero counts", async () => {
    const res = await createCategory({ name: `  R1b Tots & Toys ${RUN}  ` });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      name: `R1b Tots & Toys ${RUN}`,
      slug: `r1b-tots-toys-${RUN}`,
      iconUrl: null,
      parentId: null,
      sortOrder: 0,
      isActive: true,
      productCount: 0,
      activeProductCount: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("answers 409 on a duplicate slug (explicit or generated)", async () => {
    const generated = await createCategory({ name: `R1b Tots & Toys ${RUN}` });
    expect(generated.status).toBe(409);
    expect(generated.body.error?.details).toEqual({ field: "slug" });
    const explicit = await createCategory({ name: "Anything else", slug: `r1b-tots-toys-${RUN}` });
    expect(explicit.status).toBe(409);
  });

  it("requires an explicit slug when the name has no latin characters", async () => {
    const res = await createCategory({ name: "নবজাতক শিশু" });
    expect(res.status).toBe(422);
    const ok = await createCategory({ name: "নবজাতক শিশু", slug: `r1b-newborn-bn-${RUN}` });
    expect(ok.status).toBe(201);
    expect(ok.body.data.name).toBe("নবজাতক শিশু");
  });

  it("validates slug format, iconUrl (http(s) or /icons/...), name length and unknown keys", async () => {
    const cases: Array<Record<string, unknown>> = [
      { name: "R1b Bad Slug", slug: "Bad Slug" },
      { name: "R1b Bad Slug", slug: "double--hyphen" },
      { name: "R1b Icon", iconUrl: "javascript:alert(1)" },
      { name: "R1b Icon", iconUrl: "/images/icon.svg" },
      { name: "R1b Icon", iconUrl: "/icons/../../etc/passwd" },
      { name: "R1b Icon", iconUrl: "ftp://example.com/icon.svg" },
      { name: "x" },
      { name: "R1b Unknown", color: "pink" },
      { name: "R1b Sort", sortOrder: -1 },
      { name: "R1b Sort", sortOrder: 1.5 },
      { name: "R1b Parent", parentId: "not-a-uuid" },
    ];
    for (const body of cases) {
      const res = await createCategory(body);
      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    }
  });

  it("accepts an /icons/... path or an https URL, sortOrder and isActive", async () => {
    const path = await createCategory({ name: `R1b Icon Path ${RUN}`, iconUrl: "/icons/r1b.svg", sortOrder: 7, isActive: false });
    expect(path.status).toBe(201);
    expect(path.body.data).toMatchObject({ iconUrl: "/icons/r1b.svg", sortOrder: 7, isActive: false });
    const url = await createCategory({ name: `R1b Icon Url ${RUN}`, iconUrl: "https://cdn.example.com/icons/r1b.svg" });
    expect(url.status).toBe(201);
    expect(url.body.data.iconUrl).toBe("https://cdn.example.com/icons/r1b.svg");
  });

  it("rejects an unknown parentId with 422", async () => {
    const res = await createCategory({ name: `R1b Orphan ${RUN}`, parentId: crypto.randomUUID() });
    expect(res.status).toBe(422);
    expect(res.body.error?.details).toMatchObject({ fieldErrors: { parentId: ["Parent category does not exist"] } });
  });

  it("invalidates the public catalog cache", async () => {
    const first = await call<Array<{ slug: string }>>("GET", "/catalog/categories");
    const second = await call<Array<{ slug: string }>>("GET", "/catalog/categories");
    expect(second.headers.get("X-Cache")).toBe("HIT");
    expect(first.body.data.map((c) => c.slug)).not.toContain(`r1b-cache-${RUN}`);

    const created = await createCategory({ name: `R1b Cache ${RUN}`, slug: `r1b-cache-${RUN}` });
    expect(created.status).toBe(201);

    const after = await call<Array<{ slug: string }>>("GET", "/catalog/categories");
    expect(after.headers.get("X-Cache")).toBe("MISS");
    expect(after.body.data.map((c) => c.slug)).toContain(`r1b-cache-${RUN}`);
  });
});

describe("categories: hierarchy, patch and deactivate", () => {
  let parent: AdminCategoryDTO;
  let child: AdminCategoryDTO;
  let grandchild: AdminCategoryDTO;
  let activeProductId: string;
  let awaitingProductId: string;

  beforeAll(async () => {
    parent = (await createCategory({ name: `R1b Parent ${RUN}` })).body.data;
    child = (await createCategory({ name: `R1b Child ${RUN}`, parentId: parent.id })).body.data;
    grandchild = (await createCategory({ name: `R1b Grandchild ${RUN}`, parentId: child.id })).body.data;

    activeProductId = await fixtures.product(parent.id, { isActive: true });
    await fixtures.product(parent.id, { isActive: false }); // manually INACTIVE
    awaitingProductId = await fixtures.product(parent.id, { isActive: false, autoDeactivatedAt: new Date() });
  });

  it("creates children under an existing parent", () => {
    expect(child.parentId).toBe(parent.id);
    expect(grandchild.parentId).toBe(child.id);
  });

  it("lists every category with productCount and activeProductCount", async () => {
    const row = (await listCategories()).find((category) => category.id === parent.id);
    expect(row).toMatchObject({ productCount: 3, activeProductCount: 1, isActive: true });
  });

  it("rejects self-parenting and cycles with 422", async () => {
    const self = await call("PATCH", `${CATEGORIES}/${parent.id}`, { token: inventory.token, body: { parentId: parent.id } });
    expect(self.status).toBe(422);

    for (const descendant of [child.id, grandchild.id]) {
      const res = await call("PATCH", `${CATEGORIES}/${parent.id}`, { token: inventory.token, body: { parentId: descendant } });
      expect(res.status).toBe(422);
      expect(res.body.error?.details).toMatchObject({
        fieldErrors: { parentId: ["This parent would create a cycle in the category tree"] },
      });
    }

    const unknown = await call("PATCH", `${CATEGORIES}/${child.id}`, {
      token: inventory.token,
      body: { parentId: crypto.randomUUID() },
    });
    expect(unknown.status).toBe(422);
  });

  it("re-parents and detaches without cycles", async () => {
    const moved = await call<AdminCategoryDTO>("PATCH", `${CATEGORIES}/${grandchild.id}`, {
      token: inventory.token,
      body: { parentId: parent.id },
    });
    expect(moved.status).toBe(200);
    expect(moved.body.data.parentId).toBe(parent.id);

    const detached = await call<AdminCategoryDTO>("PATCH", `${CATEGORIES}/${grandchild.id}`, {
      token: inventory.token,
      body: { parentId: null },
    });
    expect(detached.status).toBe(200);
    expect(detached.body.data.parentId).toBeNull();
  });

  it("keeps the slug immutable (unchanged slug accepted, a new one → 422)", async () => {
    const changed = await call("PATCH", `${CATEGORIES}/${child.id}`, { token: inventory.token, body: { slug: "something-else" } });
    expect(changed.status).toBe(422);

    const same = await call<AdminCategoryDTO>("PATCH", `${CATEGORIES}/${child.id}`, {
      token: inventory.token,
      body: { slug: child.slug, name: `R1b Child Renamed ${RUN}`, sortOrder: 42, iconUrl: "/icons/child.svg" },
    });
    expect(same.status).toBe(200);
    expect(same.body.data).toMatchObject({
      slug: child.slug,
      name: `R1b Child Renamed ${RUN}`,
      sortOrder: 42,
      iconUrl: "/icons/child.svg",
    });

    const cleared = await call<AdminCategoryDTO>("PATCH", `${CATEGORIES}/${child.id}`, {
      token: inventory.token,
      body: { iconUrl: "" },
    });
    expect(cleared.body.data.iconUrl).toBeNull();
  });

  it("rejects empty and unknown-key patches; 404 for unknown ids", async () => {
    expect((await call("PATCH", `${CATEGORIES}/${child.id}`, { token: inventory.token, body: {} })).status).toBe(422);
    expect(
      (await call("PATCH", `${CATEGORIES}/${child.id}`, { token: inventory.token, body: { productCount: 9 } })).status,
    ).toBe(422);
    expect(
      (await call("PATCH", `${CATEGORIES}/${crypto.randomUUID()}`, { token: inventory.token, body: { name: "Nope" } })).status,
    ).toBe(404);
  });

  it("refuses to deactivate while ACTIVE or AWAITING_STOCK products remain (DELETE and PATCH)", async () => {
    const del = await call("DELETE", `${CATEGORIES}/${parent.id}`, { token: inventory.token });
    expect(del.status).toBe(409);
    expect(del.body.error?.details).toEqual({ listedProductCount: 2 });

    const patch = await call("PATCH", `${CATEGORIES}/${parent.id}`, { token: inventory.token, body: { isActive: false } });
    expect(patch.status).toBe(409);

    // The manually deactivated product never blocks; the awaiting-stock one still does.
    await db.update(products).set({ isActive: false }).where(eq(products.id, activeProductId));
    const stillBlocked = await call("DELETE", `${CATEGORIES}/${parent.id}`, { token: inventory.token });
    expect(stillBlocked.status).toBe(409);
    expect(stillBlocked.body.error?.details).toEqual({ listedProductCount: 1 });
  });

  it("deactivates once nothing is listed, keeps it in the admin list, and 409s a second delete", async () => {
    await db.update(products).set({ autoDeactivatedAt: null }).where(eq(products.id, awaitingProductId));

    const del = await call<AdminCategoryDTO>("DELETE", `${CATEGORIES}/${parent.id}`, { token: inventory.token });
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ id: parent.id, isActive: false, productCount: 3, activeProductCount: 0 });

    const row = (await listCategories()).find((category) => category.id === parent.id);
    expect(row?.isActive).toBe(false);

    const publicList = await call<Array<{ id: string }>>("GET", "/catalog/categories");
    expect(publicList.body.data.map((category) => category.id)).not.toContain(parent.id);

    expect((await call("DELETE", `${CATEGORIES}/${parent.id}`, { token: inventory.token })).status).toBe(409);
    expect((await call("DELETE", `${CATEGORIES}/${crypto.randomUUID()}`, { token: inventory.token })).status).toBe(404);

    const reactivated = await call<AdminCategoryDTO>("PATCH", `${CATEGORIES}/${parent.id}`, {
      token: inventory.token,
      body: { isActive: true },
    });
    expect(reactivated.body.data.isActive).toBe(true);
  });
});

describe("brands", () => {
  const brand = `R1b Brand ${RUN}`;
  const variant = `r1b brand ${RUN}`; // same brand, different spelling
  const merged = `R1b Merged ${RUN}`;
  const today = todayInBusinessTz();

  beforeAll(async () => {
    const categoryId = await fixtures.category();
    const p1 = await fixtures.product(categoryId, { brand, isActive: true });
    await fixtures.product(categoryId, { brand, isActive: false });
    const p3 = await fixtures.product(categoryId, { brand: variant, isActive: true });

    // 30-day window = today and the 29 days before it (business time zone).
    await fixtures.order(buyer.id, { status: "PENDING", total: 300, items: [{ productId: p1, quantity: 3 }] });
    await fixtures.order(buyer.id, {
      status: "DELIVERED",
      total: 200,
      createdAt: dhakaTime(addDays(today, -29), "00:30"),
      items: [{ productId: p1, quantity: 2 }],
    });
    await fixtures.order(buyer.id, { status: "CANCELLED", total: 500, items: [{ productId: p1, quantity: 5 }] });
    await fixtures.order(buyer.id, { status: "REFUNDED", total: 100, items: [{ productId: p1, quantity: 1 }] });
    await fixtures.order(buyer.id, {
      status: "DELIVERED",
      total: 700,
      createdAt: dhakaTime(addDays(today, -30), "23:30"),
      items: [{ productId: p1, quantity: 7 }],
    });
    await fixtures.order(buyer.id, { status: "PROCESSING", total: 400, items: [{ productId: p3, quantity: 4 }] });
  });

  async function listBrands(): Promise<BrandDTO[]> {
    const res = await call<BrandDTO[]>("GET", BRANDS, { token: marketing.token });
    expect(res.status).toBe(200);
    return res.body.data;
  }

  it("lists distinct brands with product counts and units sold in the last 30 business days", async () => {
    const brands = await listBrands();
    expect(brands.find((entry) => entry.name === brand)).toEqual({
      name: brand,
      productCount: 2,
      activeProductCount: 1,
      unitsSold30d: 5, // 3 (today) + 2 (first minute of the window); cancelled, refunded and older orders excluded
    });
    expect(brands.find((entry) => entry.name === variant)).toEqual({
      name: variant,
      productCount: 1,
      activeProductCount: 1,
      unitsSold30d: 4,
    });
  });

  it("validates renames: same name → 422, unknown brand → 404, blank / unknown keys → 422", async () => {
    expect((await call("PATCH", BRANDS, { token: inventory.token, body: { from: brand, to: brand } })).status).toBe(422);
    const missing = await call("PATCH", BRANDS, {
      token: inventory.token,
      body: { from: `No Such Brand ${RUN}`, to: merged },
    });
    expect(missing.status).toBe(404);
    expect((await call("PATCH", BRANDS, { token: inventory.token, body: { from: brand, to: "   " } })).status).toBe(422);
    expect(
      (await call("PATCH", BRANDS, { token: inventory.token, body: { from: brand, to: merged, all: true } })).status,
    ).toBe(422);
    expect((await call("PATCH", BRANDS, { token: marketing.token, body: { from: brand, to: merged } })).status).toBe(403);
  });

  it("renames every product whose brand matches case-insensitively, merging spellings", async () => {
    const res = await call<{ updated: number }>("PATCH", BRANDS, {
      token: inventory.token,
      body: { from: `  R1B BRAND ${RUN.toUpperCase()} `, to: merged },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 3 });

    const brands = await listBrands();
    expect(brands.find((entry) => entry.name === brand)).toBeUndefined();
    expect(brands.find((entry) => entry.name === variant)).toBeUndefined();
    expect(brands.find((entry) => entry.name === merged)).toEqual({
      name: merged,
      productCount: 3,
      activeProductCount: 2,
      unitsSold30d: 9,
    });
  });
});
