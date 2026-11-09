import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as bcrypt from "bcryptjs";
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema/tables";
import { AppError } from "../lib/errors";
import { Permissions } from "../lib/rbac";
import { BCRYPT_ROUNDS } from "../services/auth.service";
import { type RoleDTO, StaffService, type StaffMemberDTO } from "../services/staff.service";
import { USER_ROLES } from "../types";
import { call, ManagementFixtures, RUN, uniquePhone, type TestUser } from "../tests/management-fixtures";

const fixtures = new ManagementFixtures("staff");
const STRONG_PASSWORD = "Correct-Horse-12";

let admin: TestUser;
let otherAdmin: TestUser;
let orderManager: TestUser;
let customer: TestUser;

beforeAll(async () => {
  admin = await fixtures.user("SUPER_ADMIN");
  otherAdmin = await fixtures.user("SUPER_ADMIN");
  orderManager = await fixtures.user("ORDER_MANAGER");
  customer = await fixtures.user("CUSTOMER");
});

afterAll(async () => {
  await fixtures.cleanup();
});

async function createStaff(body: Record<string, unknown>) {
  const res = await call<StaffMemberDTO>("POST", "/admin/staff", { token: admin.token, body });
  if (res.status === 201) fixtures.trackUser(res.body.data.id);
  return res;
}

describe("GET /admin/staff", () => {
  it("lists every non-CUSTOMER account without password hashes", async () => {
    const res = await call<StaffMemberDTO[]>("GET", "/admin/staff", { token: admin.token });
    expect(res.status).toBe(200);
    const listed = res.body.data.map((member) => member.id);
    expect(listed).toEqual(expect.arrayContaining([admin.id, otherAdmin.id, orderManager.id]));
    expect(listed).not.toContain(customer.id);
    expect(res.body.data.filter((member) => String(member.role) === "CUSTOMER")).toHaveLength(0);
    expect(res.text).not.toContain("passwordHash");
    expect(res.text).not.toContain("not-used");
    expect(res.body.data.find((member) => member.id === orderManager.id)).toEqual({
      id: orderManager.id,
      fullName: orderManager.fullName,
      email: orderManager.email,
      phone: orderManager.phone,
      role: "ORDER_MANAGER",
      isActive: true,
      createdAt: expect.any(String),
    });
  });
});

describe("POST /admin/staff", () => {
  const phone = uniquePhone();
  const email = `r1b-new-staff-${RUN}@test.myoxygen.local`;

  it("creates a staff account: lower-case email, canonical phone, bcrypt hash, 201 without the hash", async () => {
    const res = await createStaff({
      fullName: "  R1b New Packer  ",
      email: email.toUpperCase(),
      phone: `+880 ${phone.slice(1, 5)}-${phone.slice(5)}`,
      role: "ORDER_MANAGER",
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      fullName: "R1b New Packer",
      email,
      phone,
      role: "ORDER_MANAGER",
      isActive: true,
      createdAt: expect.any(String),
    });
    expect(res.text).not.toContain(STRONG_PASSWORD);
    expect(res.text).not.toContain("password");

    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, res.body.data.id));
    const hash = row?.passwordHash ?? "";
    expect(bcrypt.getRounds(hash)).toBe(BCRYPT_ROUNDS);
    expect(await bcrypt.compare(STRONG_PASSWORD, hash)).toBe(true);
  });

  it("answers 409 for a duplicate email (any case) or phone (any format)", async () => {
    const dupEmail = await createStaff({
      fullName: "R1b Dup Email",
      email: email.replace("r1b", "R1B"),
      phone: uniquePhone(),
      role: "SUPPORT_STAFF",
      password: STRONG_PASSWORD,
    });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error?.details).toEqual({ field: "email" });

    const dupPhone = await createStaff({
      fullName: "R1b Dup Phone",
      email: `r1b-dup-phone-${RUN}@test.myoxygen.local`,
      phone: `880${phone.slice(1)}`,
      role: "SUPPORT_STAFF",
      password: STRONG_PASSWORD,
    });
    expect(dupPhone.status).toBe(409);
    expect(dupPhone.body.error?.details).toEqual({ field: "phone" });

    // A customer's phone is taken too.
    const customerPhone = await createStaff({
      fullName: "R1b Dup Customer Phone",
      email: `r1b-dup-cust-${RUN}@test.myoxygen.local`,
      phone: customer.phone,
      role: "SUPPORT_STAFF",
      password: STRONG_PASSWORD,
    });
    expect(customerPhone.status).toBe(409);
  });

  it("validates password length (12–72 bytes), role, phone, email and unknown keys", async () => {
    const valid = {
      fullName: "R1b Validation",
      email: `r1b-validation-${RUN}@test.myoxygen.local`,
      phone: uniquePhone(),
      role: "SUPPORT_STAFF",
      password: STRONG_PASSWORD,
    };
    const invalid: Array<Record<string, unknown>> = [
      { ...valid, password: "Elevenchars" }, // 11 characters
      { ...valid, password: "x".repeat(73) },
      { ...valid, password: "অ".repeat(25) }, // 25 characters but 75 bytes
      { ...valid, role: "CUSTOMER" },
      { ...valid, role: "OWNER" },
      { ...valid, phone: "01212345678" },
      { ...valid, email: "not-an-email" },
      { ...valid, fullName: "R" },
      { ...valid, isActive: false },
      { fullName: valid.fullName, phone: valid.phone, role: valid.role, password: valid.password },
    ];
    for (const body of invalid) {
      const res = await createStaff(body);
      expect(res.status).toBe(422);
    }
    const exactlyTwelve = await createStaff({ ...valid, password: "Twelve-chars" });
    expect(exactlyTwelve.status).toBe(201);
  });
});

describe("PATCH /admin/staff/:id", () => {
  it("forbids changing your own role or deactivating yourself (409)", async () => {
    const demote = await call("PATCH", `/admin/staff/${admin.id}`, { token: admin.token, body: { role: "ORDER_MANAGER" } });
    expect(demote.status).toBe(409);
    expect(demote.body.error?.details).toEqual({ reason: "SELF_ROLE_CHANGE" });

    const deactivate = await call("PATCH", `/admin/staff/${admin.id}`, { token: admin.token, body: { isActive: false } });
    expect(deactivate.status).toBe(409);
    expect(deactivate.body.error?.details).toEqual({ reason: "SELF_DEACTIVATION" });

    const [row] = await db.select({ role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, admin.id));
    expect(row).toEqual({ role: "SUPER_ADMIN", isActive: true });
  });

  it("lets you rename yourself and re-send your current role", async () => {
    const res = await call<StaffMemberDTO>("PATCH", `/admin/staff/${admin.id}`, {
      token: admin.token,
      body: { fullName: `R1b Renamed Admin ${RUN}`, role: "SUPER_ADMIN", isActive: true },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: admin.id, fullName: `R1b Renamed Admin ${RUN}`, role: "SUPER_ADMIN" });
  });

  it("demotes another SUPER_ADMIN while one remains; the new role applies to existing tokens immediately", async () => {
    expect((await call("GET", "/admin/staff", { token: otherAdmin.token })).status).toBe(200);

    const res = await call<StaffMemberDTO>("PATCH", `/admin/staff/${otherAdmin.id}`, {
      token: admin.token,
      body: { role: "SUPPORT_STAFF" },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("SUPPORT_STAFF");

    expect((await call("GET", "/admin/staff", { token: otherAdmin.token })).status).toBe(403);
    expect((await call("GET", "/admin/customers", { token: otherAdmin.token })).status).toBe(200);
  });

  it("deactivates and re-activates a staff account (existing tokens stop working at once)", async () => {
    expect((await call("GET", "/admin/delivery/summary", { token: orderManager.token })).status).toBe(200);

    const off = await call<StaffMemberDTO>("PATCH", `/admin/staff/${orderManager.id}`, {
      token: admin.token,
      body: { isActive: false },
    });
    expect(off.status).toBe(200);
    expect(off.body.data.isActive).toBe(false);
    expect((await call("GET", "/admin/delivery/summary", { token: orderManager.token })).status).toBe(401);

    const on = await call<StaffMemberDTO>("PATCH", `/admin/staff/${orderManager.id}`, {
      token: admin.token,
      body: { isActive: true },
    });
    expect(on.body.data.isActive).toBe(true);
    expect((await call("GET", "/admin/delivery/summary", { token: orderManager.token })).status).toBe(200);
  });

  it("answers 404 for customers and unknown ids, 422 for invalid bodies", async () => {
    expect((await call("PATCH", `/admin/staff/${customer.id}`, { token: admin.token, body: { isActive: false } })).status).toBe(
      404,
    );
    expect(
      (await call("PATCH", `/admin/staff/${crypto.randomUUID()}`, { token: admin.token, body: { isActive: false } })).status,
    ).toBe(404);
    expect((await call("PATCH", `/admin/staff/${orderManager.id}`, { token: admin.token, body: {} })).status).toBe(422);
    expect(
      (await call("PATCH", `/admin/staff/${orderManager.id}`, { token: admin.token, body: { role: "CUSTOMER" } })).status,
    ).toBe(422);
    expect(
      (await call("PATCH", `/admin/staff/${orderManager.id}`, { token: admin.token, body: { email: "x@y.z" } })).status,
    ).toBe(422);
    expect((await call("PATCH", "/admin/staff/not-a-uuid", { token: admin.token, body: { isActive: true } })).status).toBe(
      422,
    );
  });
});

describe("last active SUPER_ADMIN guard (service level, rolled back)", () => {
  class Rollback extends Error {}

  it("refuses to demote or deactivate the only remaining active SUPER_ADMIN", async () => {
    const outcomes: Array<{ case: string; error: unknown }> = [];
    let renamed: StaffMemberDTO | null = null;

    // Everything below runs in ONE transaction that is always rolled back, so the
    // shared database (seeded admin, other suites' admins) is never changed.
    const run = db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ isActive: false })
        .where(and(eq(users.role, "SUPER_ADMIN"), ne(users.id, admin.id)));
      const [active] = await tx
        .select({ value: count() })
        .from(users)
        .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.isActive, true)));
      expect(active?.value).toBe(1);

      // The actor is someone else (STAFF_MANAGE is SUPER_ADMIN-only over HTTP, so this
      // path is only reachable through races or future role changes — still guarded).
      const service = new StaffService(tx);
      for (const [label, patch] of [
        ["demote", { role: "ORDER_MANAGER" as const }],
        ["deactivate", { isActive: false }],
      ] as const) {
        try {
          await service.updateStaff({ id: orderManager.id }, admin.id, patch);
          outcomes.push({ case: label, error: null });
        } catch (error) {
          outcomes.push({ case: label, error });
        }
      }
      renamed = await service.updateStaff({ id: orderManager.id }, admin.id, { fullName: `R1b Last Admin ${RUN}` });
      throw new Rollback();
    });
    await expect(run).rejects.toBeInstanceOf(Rollback);

    expect(outcomes).toHaveLength(2);
    for (const outcome of outcomes) {
      expect(outcome.error).toBeInstanceOf(AppError);
      const error = outcome.error as AppError;
      expect(error.httpStatus).toBe(409);
      expect(error.details).toEqual({ reason: "LAST_SUPER_ADMIN" });
    }
    expect(renamed).toMatchObject({ id: admin.id, role: "SUPER_ADMIN", isActive: true });

    // Rolled back: the other SUPER_ADMIN accounts are still active.
    const [stillActive] = await db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.isActive, true), ne(users.id, admin.id)));
    expect(stillActive?.value ?? 0).toBeGreaterThan(0);
  });
});

describe("GET /admin/roles", () => {
  it("returns every role with its permissions and user count", async () => {
    const res = await call<RoleDTO[]>("GET", "/admin/roles", { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.data.map((entry) => entry.role)).toEqual([...USER_ROLES]);

    const byRole = new Map(res.body.data.map((entry) => [entry.role, entry]));
    expect(byRole.get("SUPER_ADMIN")?.permissions.sort()).toEqual(Object.values(Permissions).sort());
    expect(byRole.get("CUSTOMER")?.permissions).toEqual([]);
    expect(byRole.get("SUPPORT_STAFF")?.permissions).toEqual([
      Permissions.PRODUCTS_READ,
      Permissions.ORDERS_READ,
      Permissions.REFUNDS_REQUEST,
    ]);

    const counts = await db.select({ role: users.role, value: count() }).from(users).groupBy(users.role);
    for (const row of counts) {
      expect(byRole.get(row.role)?.userCount).toBe(row.value);
    }
    expect(byRole.get("SUPER_ADMIN")?.userCount ?? 0).toBeGreaterThanOrEqual(1);
  });
});
