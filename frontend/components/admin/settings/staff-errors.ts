import { isApiError } from "../../../lib/api-client";
import { ADMIN_STAFF_CONFLICT_REASONS, type AdminStaffConflictReason } from "../../../types/admin-management";

/** `details.reason` of a 409 from `PATCH /admin/staff/:id`, or `null`. */
export function readStaffConflictReason(error: unknown): AdminStaffConflictReason | null {
  if (!isApiError(error) || error.status !== 409) {
    return null;
  }
  const details = error.details;
  if (typeof details === "object" && details !== null && "reason" in details) {
    const reason = details.reason;
    return ADMIN_STAFF_CONFLICT_REASONS.find((known) => known === reason) ?? null;
  }
  return null;
}

/** Plain-language explanation and the form field it belongs to. */
export const STAFF_CONFLICT_MESSAGES: Record<AdminStaffConflictReason, { field: "role" | "isActive"; message: string }> = {
  SELF_ROLE_CHANGE: {
    field: "role",
    message: "You can't change your own role. Another super admin has to do it, so nobody locks themselves out by mistake.",
  },
  SELF_DEACTIVATION: {
    field: "isActive",
    message: "You can't deactivate your own account while you're signed in with it.",
  },
  LAST_SUPER_ADMIN: {
    field: "role",
    message: "This is the only active super admin. Make someone else a super admin first — the store always needs one.",
  },
};
