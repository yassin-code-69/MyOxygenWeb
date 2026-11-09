"use client";

import { useCallback } from "react";
import { api } from "../../lib/api-client";
import { PERMISSIONS } from "../../types/auth";
import type {
  AdminRoleSummary,
  AdminStaffCreatePayload,
  AdminStaffMember,
  AdminStaffUpdatePayload,
} from "../../types/admin-management";
import { useAdminResource, useAdminRevalidate } from "./swr";
import { useCan } from "./use-permission";

/** `GET /admin/staff` (STAFF_MANAGE): every non-CUSTOMER account. */
export function useStaff() {
  const allowed = useCan(PERMISSIONS.STAFF_MANAGE);
  return useAdminResource<AdminStaffMember[]>("/admin/staff", {}, allowed, { keepPreviousData: true });
}

/** `GET /admin/roles` (STAFF_MANAGE): the role × permission matrix with account counts. */
export function useRoles() {
  const allowed = useCan(PERMISSIONS.STAFF_MANAGE);
  return useAdminResource<AdminRoleSummary[]>("/admin/roles", {}, allowed, { keepPreviousData: true });
}

/** Staff writes (STAFF_MANAGE). Role counts change with them, so `/admin/roles` refreshes too. */
export function useStaffMutations() {
  const revalidate = useAdminRevalidate();
  const refresh = useCallback(() => revalidate("/admin/staff", "/admin/roles"), [revalidate]);

  const createStaff = useCallback(
    async (payload: AdminStaffCreatePayload) => {
      const member = await api.post<AdminStaffMember>("/admin/staff", payload);
      await refresh();
      return member;
    },
    [refresh],
  );

  /** 409 `details.reason`: SELF_ROLE_CHANGE | SELF_DEACTIVATION | LAST_SUPER_ADMIN. */
  const updateStaff = useCallback(
    async (id: string, payload: AdminStaffUpdatePayload) => {
      const member = await api.patch<AdminStaffMember>(`/admin/staff/${id}`, payload);
      await refresh();
      return member;
    },
    [refresh],
  );

  return { createStaff, updateStaff };
}
