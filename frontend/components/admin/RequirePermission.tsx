"use client";

import type { ReactNode } from "react";
import { useAuthStore } from "../../lib/auth-store";
import { hasPermission } from "../../lib/permissions";
import type { Permission } from "../../types/auth";
import { ForbiddenPanel } from "./ForbiddenPanel";

export interface RequirePermissionProps {
  permission: Permission;
  children: ReactNode;
  /** Rendered instead of the default 403 panel. Pass `null` to render nothing. */
  fallback?: ReactNode;
}

/**
 * Renders `children` only when the signed-in user holds `permission`.
 * Children (and their data hooks) never mount otherwise, so no request the
 * backend would reject with 403 is sent.
 */
export function RequirePermission({ permission, children, fallback }: RequirePermissionProps) {
  const role = useAuthStore((state) => state.user?.role ?? null);
  if (hasPermission(role, permission)) {
    return children;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  return <ForbiddenPanel permission={permission} />;
}
