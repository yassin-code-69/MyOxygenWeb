/**
 * Mounted at /admin in src/index.ts. GET/POST /admin/staff, PATCH /admin/staff/:id, GET /admin/roles.
 * See docs/API_CONTRACT.md ("Admin v2" → "Management"). Every route needs STAFF_MANAGE.
 *
 * Authentication is applied per route (never `use("*")`), so these
 * middlewares do not run for the other /admin sub-apps.
 */
import { Hono } from "hono";
import { z } from "zod";
import { created, ok } from "../lib/http";
import { Permissions } from "../lib/rbac";
import { uuidParam, validate } from "../lib/validation";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { normalizeBangladeshMobile } from "../services/phone";
import { STAFF_ROLES, staffService } from "../services/staff.service";

export const adminStaffRoute = new Hono<AuthContext>();

export const MIN_STAFF_PASSWORD_LENGTH = 12;
/** bcrypt only uses the first 72 bytes; longer passwords are rejected rather than silently truncated. */
const MAX_PASSWORD_BYTES = 72;

const fullNameField = z
  .string()
  .trim()
  .min(2, "Name must have at least 2 characters")
  .max(255, "Name must not exceed 255 characters");

const bangladeshMobile = z
  .string()
  .trim()
  .max(32)
  .transform((value, ctx) => {
    const normalized = normalizeBangladeshMobile(value);
    if (normalized === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid Bangladeshi mobile number (01XXXXXXXXX)" });
      return z.NEVER;
    }
    return normalized;
  });

export const createStaffSchema = z
  .object({
    fullName: fullNameField,
    email: z.string().trim().toLowerCase().email("Invalid email address").max(255),
    phone: bangladeshMobile,
    role: z.enum(STAFF_ROLES),
    password: z
      .string()
      .min(MIN_STAFF_PASSWORD_LENGTH, `Password must be at least ${MIN_STAFF_PASSWORD_LENGTH} characters`)
      .refine(
        (value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES,
        `Password must not exceed ${MAX_PASSWORD_BYTES} bytes`,
      ),
  })
  .strict();

export const updateStaffSchema = z
  .object({
    fullName: fullNameField.optional(),
    role: z.enum(STAFF_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one of fullName, role or isActive",
  });

// GET /admin/staff — every non-CUSTOMER account
adminStaffRoute.get("/staff", requireAuth, requirePermission(Permissions.STAFF_MANAGE), async (c) => {
  return ok(c, await staffService.listStaff());
});

// POST /admin/staff — create a staff account
adminStaffRoute.post(
  "/staff",
  requireAuth,
  requirePermission(Permissions.STAFF_MANAGE),
  validate("json", createStaffSchema),
  async (c) => {
    return created(c, await staffService.createStaff(c.req.valid("json")));
  },
);

// PATCH /admin/staff/:id — name, role, active flag (self and last-SUPER_ADMIN guards)
adminStaffRoute.patch(
  "/staff/:id",
  requireAuth,
  requirePermission(Permissions.STAFF_MANAGE),
  validate("param", uuidParam),
  validate("json", updateStaffSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const actor = { id: c.get("user").sub };
    return ok(c, await staffService.updateStaff(actor, id, c.req.valid("json")));
  },
);

// GET /admin/roles — roles, their permissions and how many accounts hold each
adminStaffRoute.get("/roles", requireAuth, requirePermission(Permissions.STAFF_MANAGE), async (c) => {
  return ok(c, await staffService.listRoles());
});
