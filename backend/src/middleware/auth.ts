import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db } from "../db/client";
import { users } from "../db/schema/tables";
import { AppError } from "../lib/errors";
import { InvalidTokenError, verifyAccessToken, type UserTokenPayload } from "../lib/jwt";
import { hasPermission, type Permission } from "../lib/rbac";
import type { UserRole } from "../types";

/** Hono env for routes behind `requireAuth`: `c.get("user")` is the verified caller. */
export interface AuthContext {
  Variables: {
    user: UserTokenPayload;
  };
}

/**
 * Requires a valid ACCESS token (`Authorization: Bearer <jwt>`) for an
 * existing, active user. The role is taken from the database, so role
 * changes and deactivation take effect immediately (one primary-key lookup).
 */
export const requireAuth = createMiddleware<AuthContext>(async (c, next) => {
  const header = c.req.header("Authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    throw AppError.unauthorized("Authorization token required");
  }

  let payload: UserTokenPayload;
  try {
    payload = await verifyAccessToken(match[1]);
  } catch (error) {
    if (error instanceof InvalidTokenError && error.message === "Access token required") {
      throw AppError.unauthorized("Access token required");
    }
    throw AppError.unauthorized("Invalid or expired authentication token");
  }

  const [account] = await db
    .select({ role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!account || !account.isActive) {
    throw AppError.unauthorized("Account is inactive or no longer exists");
  }

  c.set("user", { ...payload, role: account.role });
  await next();
});

/** Requires the authenticated user to have one of the given roles (use after `requireAuth`). */
export const requireRole = (...roles: UserRole[]) =>
  createMiddleware<AuthContext>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      throw AppError.unauthorized();
    }
    if (!roles.includes(user.role)) {
      throw AppError.forbidden("Insufficient role", { requiredRoles: roles });
    }
    await next();
  });

/** Requires a granular permission (SUPER_ADMIN always passes). Use after `requireAuth`. */
export const requirePermission = (permission: Permission) =>
  createMiddleware<AuthContext>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      throw AppError.unauthorized();
    }
    if (!hasPermission(user.role, permission)) {
      throw AppError.forbidden(`Missing required permission [${permission}]`, { permission });
    }
    await next();
  });
