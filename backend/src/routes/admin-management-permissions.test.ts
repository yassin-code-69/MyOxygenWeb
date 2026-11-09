/**
 * RBAC matrix for the admin management endpoints: every endpoint × (no token,
 * every role). Roles with the permission must get past auth; mutating
 * endpoints are probed with invalid bodies / unknown ids (422 / 404) so the
 * matrix never changes data.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { hasPermission, type Permission, Permissions } from "../lib/rbac";
import { USER_ROLES, type UserRole } from "../types";
import { call, type HttpMethod, ManagementFixtures, type TestUser } from "../tests/management-fixtures";

const fixtures = new ManagementFixtures("rbac");
const tokens = new Map<UserRole, TestUser>();
let customerId: string;
let staffId: string;
let categoryId: string;
let inactiveAdmin: TestUser;

interface EndpointCase {
  method: HttpMethod;
  path: () => string;
  permission: Permission;
  body?: unknown;
  /** Status for a caller that holds the permission. */
  allowedStatus: number;
}

const endpoints: EndpointCase[] = [
  { method: "GET", path: () => "/admin/customers", permission: Permissions.ORDERS_READ, allowedStatus: 200 },
  { method: "GET", path: () => `/admin/customers/${customerId}`, permission: Permissions.ORDERS_READ, allowedStatus: 200 },
  {
    method: "PATCH",
    path: () => `/admin/customers/${customerId}`,
    permission: Permissions.STAFF_MANAGE,
    body: {},
    allowedStatus: 422,
  },
  { method: "GET", path: () => "/admin/catalog/categories", permission: Permissions.PRODUCTS_READ, allowedStatus: 200 },
  {
    method: "POST",
    path: () => "/admin/catalog/categories",
    permission: Permissions.PRODUCTS_WRITE,
    body: {},
    allowedStatus: 422,
  },
  {
    method: "PATCH",
    path: () => `/admin/catalog/categories/${categoryId}`,
    permission: Permissions.PRODUCTS_WRITE,
    body: {},
    allowedStatus: 422,
  },
  {
    method: "DELETE",
    path: () => `/admin/catalog/categories/${crypto.randomUUID()}`,
    permission: Permissions.PRODUCTS_WRITE,
    allowedStatus: 404,
  },
  { method: "GET", path: () => "/admin/catalog/brands", permission: Permissions.PRODUCTS_READ, allowedStatus: 200 },
  {
    method: "PATCH",
    path: () => "/admin/catalog/brands",
    permission: Permissions.PRODUCTS_WRITE,
    body: {},
    allowedStatus: 422,
  },
  { method: "GET", path: () => "/admin/staff", permission: Permissions.STAFF_MANAGE, allowedStatus: 200 },
  { method: "POST", path: () => "/admin/staff", permission: Permissions.STAFF_MANAGE, body: {}, allowedStatus: 422 },
  {
    method: "PATCH",
    path: () => `/admin/staff/${staffId}`,
    permission: Permissions.STAFF_MANAGE,
    body: {},
    allowedStatus: 422,
  },
  { method: "GET", path: () => "/admin/roles", permission: Permissions.STAFF_MANAGE, allowedStatus: 200 },
  { method: "GET", path: () => "/admin/system/status", permission: Permissions.STAFF_MANAGE, allowedStatus: 200 },
  { method: "GET", path: () => "/admin/delivery/summary", permission: Permissions.ORDERS_READ, allowedStatus: 200 },
];

beforeAll(async () => {
  for (const role of USER_ROLES) {
    tokens.set(role, await fixtures.user(role));
  }
  customerId = tokens.get("CUSTOMER")?.id ?? "";
  staffId = tokens.get("SUPPORT_STAFF")?.id ?? "";
  categoryId = await fixtures.category();
  inactiveAdmin = await fixtures.user("SUPER_ADMIN", { isActive: false });
});

afterAll(async () => {
  await fixtures.cleanup();
});

describe("admin management RBAC matrix", () => {
  for (const endpoint of endpoints) {
    const label = `${endpoint.method} ${endpoint.path().replace(/[0-9a-f-]{36}|undefined/g, ":id")}`;

    it(`${label} → 401 without a token or for an inactive account`, async () => {
      const anonymous = await call(endpoint.method, endpoint.path(), { body: endpoint.body });
      expect(anonymous.status).toBe(401);
      expect(anonymous.body.error?.code).toBe("UNAUTHORIZED");

      const inactive = await call(endpoint.method, endpoint.path(), { token: inactiveAdmin.token, body: endpoint.body });
      expect(inactive.status).toBe(401);
    });

    it(`${label} → ${endpoint.permission} required (403 otherwise)`, async () => {
      for (const role of USER_ROLES) {
        const user = tokens.get(role);
        if (!user) throw new Error(`missing ${role} fixture`);
        const res = await call(endpoint.method, endpoint.path(), { token: user.token, body: endpoint.body });
        const expected = hasPermission(role, endpoint.permission) ? endpoint.allowedStatus : 403;
        if (res.status !== expected) {
          throw new Error(`${role}: expected ${expected}, got ${res.status} ${JSON.stringify(res.body.error)}`);
        }
        if (expected === 403) {
          expect(res.body.error?.details).toEqual({ permission: endpoint.permission });
        }
      }
    });
  }

  it("does not leak auth middleware onto other /admin sub-apps", async () => {
    const inventory = tokens.get("INVENTORY_MANAGER");
    const marketing = tokens.get("MARKETING_MANAGER");
    if (!inventory || !marketing) throw new Error("missing fixtures");
    expect((await call("GET", "/admin/batches", { token: inventory.token })).status).toBe(200);
    expect((await call("GET", "/admin/discounts", { token: marketing.token })).status).toBe(200);
  });
});
