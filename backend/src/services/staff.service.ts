/**
 * Staff accounts and roles (GET/POST /admin/staff, PATCH /admin/staff/:id,
 * GET /admin/roles). Staff = every user whose role is not CUSTOMER.
 *
 * Guards on PATCH (409 CONFLICT, `details.reason`):
 * - SELF_ROLE_CHANGE / SELF_DEACTIVATION: nobody can change their own role or
 *   deactivate their own account (prevents locking yourself out).
 * - LAST_SUPER_ADMIN: the store always keeps at least one active SUPER_ADMIN.
 *
 * Every PATCH runs in a transaction holding a transaction-scoped advisory
 * lock, so two concurrent demotions can never both pass the
 * "another active SUPER_ADMIN exists" check.
 */
import * as bcrypt from "bcryptjs";
import { and, asc, count, eq, ne, or, sql } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { users } from "../db/schema/tables";
import { isUniqueViolation } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import { type Permission, RolePermissions } from "../lib/rbac";
import { USER_ROLES, type UserRole } from "../types";
import { BCRYPT_ROUNDS, normalizeEmail } from "./auth.service";
import { type DbExecutor, runInTransaction } from "./db-executor";
import { toIso } from "./service-utils";

export type StaffRole = Exclude<UserRole, "CUSTOMER">;

/** Roles a staff account may hold (every role except CUSTOMER). */
export const STAFF_ROLES = [
  "SUPER_ADMIN",
  "INVENTORY_MANAGER",
  "ORDER_MANAGER",
  "MARKETING_MANAGER",
  "SUPPORT_STAFF",
] as const satisfies readonly StaffRole[];

/** Key for pg_advisory_xact_lock serialising staff role / status changes. */
const STAFF_GUARD_LOCK = "my-oxygen:staff-guard";

export interface StaffMemberDTO {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  role: StaffRole;
  isActive: boolean;
  createdAt: string;
}

export interface RoleDTO {
  role: UserRole;
  permissions: Permission[];
  userCount: number;
}

export interface CreateStaffInput {
  fullName: string;
  email: string;
  /** Canonical 01XXXXXXXXX (the route schema normalises it). */
  phone: string;
  role: StaffRole;
  password: string;
}

export interface UpdateStaffInput {
  fullName?: string;
  role?: StaffRole;
  isActive?: boolean;
}

export interface StaffActor {
  id: string;
}

const staffColumns = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  phone: users.phone,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
} as const;

interface StaffRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

export function isStaffRole(role: UserRole): role is StaffRole {
  return role !== "CUSTOMER";
}

function toStaffDTO(row: StaffRow): StaffMemberDTO {
  if (!isStaffRole(row.role)) {
    // Unreachable: every query below filters out CUSTOMER rows.
    throw AppError.internal("Expected a staff account");
  }
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    role: row.role,
    isActive: row.isActive,
    createdAt: toIso(row.createdAt),
  };
}

const isStaff = ne(users.role, "CUSTOMER");

function duplicateConflict(field: "email" | "phone"): AppError {
  return AppError.conflict(`A user with this ${field === "email" ? "email address" : "phone number"} already exists`, {
    field,
  });
}

export class StaffService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  /** Every non-CUSTOMER account, oldest first. */
  async listStaff(): Promise<StaffMemberDTO[]> {
    const rows = await this.db
      .select(staffColumns)
      .from(users)
      .where(isStaff)
      .orderBy(asc(users.createdAt), asc(users.id));
    return rows.map(toStaffDTO);
  }

  /** Creates a staff account with a bcrypt-hashed password (409 on duplicate email / phone). */
  async createStaff(input: CreateStaffInput): Promise<StaffMemberDTO> {
    const email = normalizeEmail(input.email);
    const phone = input.phone;

    const existing = await this.db
      .select({ email: users.email, phone: users.phone })
      .from(users)
      .where(or(eq(users.email, email), eq(users.phone, phone)));
    if (existing.some((row) => row.email === email)) throw duplicateConflict("email");
    if (existing.some((row) => row.phone === phone)) throw duplicateConflict("phone");

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    let created: StaffRow | undefined;
    try {
      [created] = await this.db
        .insert(users)
        .values({ fullName: input.fullName, email, phone, role: input.role, passwordHash, isActive: true })
        .returning(staffColumns);
    } catch (error) {
      // Lost a race with a concurrent insert of the same email / phone.
      if (isUniqueViolation(error, "users_email_unique")) throw duplicateConflict("email");
      if (isUniqueViolation(error, "users_phone_unique")) throw duplicateConflict("phone");
      throw error;
    }
    if (!created) throw AppError.internal("Staff account could not be created");
    return toStaffDTO(created);
  }

  /** Updates name / role / active flag with the self and last-SUPER_ADMIN guards. */
  async updateStaff(actor: StaffActor, id: string, patch: UpdateStaffInput): Promise<StaffMemberDTO> {
    return runInTransaction(this.db, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${STAFF_GUARD_LOCK}))`);

      const [target] = await tx
        .select(staffColumns)
        .from(users)
        .where(and(eq(users.id, id), isStaff))
        .for("update");
      if (!target) throw AppError.notFound("Staff member");

      const changesRole = patch.role !== undefined && patch.role !== target.role;
      const deactivates = patch.isActive === false && target.isActive;
      const isSelf = target.id === actor.id;

      if (isSelf && changesRole) {
        throw AppError.conflict("You cannot change your own role", { reason: "SELF_ROLE_CHANGE" });
      }
      if (isSelf && patch.isActive === false) {
        throw AppError.conflict("You cannot deactivate your own account", { reason: "SELF_DEACTIVATION" });
      }

      if (target.role === "SUPER_ADMIN" && target.isActive && (changesRole || deactivates)) {
        const [others] = await tx
          .select({ value: count() })
          .from(users)
          .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.isActive, true), ne(users.id, target.id)));
        if ((others?.value ?? 0) === 0) {
          throw AppError.conflict("At least one active super admin must remain", { reason: "LAST_SUPER_ADMIN" });
        }
      }

      const values: Partial<typeof users.$inferInsert> = {};
      if (patch.fullName !== undefined) values.fullName = patch.fullName;
      if (patch.role !== undefined) values.role = patch.role;
      if (patch.isActive !== undefined) values.isActive = patch.isActive;

      const [updated] = await tx.update(users).set(values).where(eq(users.id, target.id)).returning(staffColumns);
      if (!updated) throw AppError.notFound("Staff member");
      return toStaffDTO(updated);
    });
  }

  /** Every role with its permissions (SUPER_ADMIN = all) and how many accounts hold it. */
  async listRoles(): Promise<RoleDTO[]> {
    const rows = await this.db.select({ role: users.role, value: count() }).from(users).groupBy(users.role);
    const counts = new Map<UserRole, number>(rows.map((row) => [row.role, Number(row.value)]));
    return USER_ROLES.map((role) => ({
      role,
      permissions: [...RolePermissions[role]],
      userCount: counts.get(role) ?? 0,
    }));
  }
}

export const staffService = new StaffService();
