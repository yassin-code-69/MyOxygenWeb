"use client";

import { useAuthStore } from "../../lib/auth-store";
import { hasPermission } from "../../lib/permissions";
import type { Permission, UserRole } from "../../types/auth";

/** The signed-in user's role (null while signed out). */
export function useAdminRole(): UserRole | null {
  return useAuthStore((state) => state.user?.role ?? null);
}

/** True when the signed-in user holds the permission. */
export function useCan(permission: Permission): boolean {
  const role = useAdminRole();
  return hasPermission(role, permission);
}
