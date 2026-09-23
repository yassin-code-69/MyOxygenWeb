import { createMiddleware } from "hono/factory";
import { verifyToken, type UserTokenPayload } from "../lib/jwt";
import { type Permission, RolePermissions } from "../lib/rbac";

export interface AuthContext {
  Variables: {
    user: UserTokenPayload;
  };
}

// Enforces valid JWT token
export const requireAuth = createMiddleware<AuthContext>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { success: false, error: "Authorization token required" },
      401,
    );
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = await verifyToken(token);
    if (payload.tokenType && payload.tokenType !== "access") {
      return c.json(
        { success: false, error: "Access token required" },
        401,
      );
    }
    c.set("user", payload);
    await next();
  } catch {
    return c.json(
      { success: false, error: "Invalid or expired authentication token" },
      401,
    );
  }
});

// Enforces specified role(s)
export const requireRole = (...roles: string[]) => {
  return createMiddleware<AuthContext>(async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      return c.json(
        { success: false, error: "Forbidden: Insufficient role permissions" },
        403,
      );
    }
    await next();
  });
};

// Enforces granular permission based on user role
export const requirePermission = (permission: Permission) => {
  return createMiddleware<AuthContext>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const assignedPermissions = RolePermissions[user.role] || [];
    const hasPermission =
      user.role === "SUPER_ADMIN" || assignedPermissions.includes(permission);

    if (!hasPermission) {
      return c.json(
        {
          success: false,
          error: `Forbidden: Missing required permission [${permission}]`,
        },
        403,
      );
    }
    await next();
  });
};
