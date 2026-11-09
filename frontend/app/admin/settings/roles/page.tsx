"use client";

import { RequirePermission } from "../../../../components/admin/RequirePermission";
import { RolesView } from "../../../../components/admin/settings/RolesView";
import { PERMISSIONS } from "../../../../types/auth";

/** `/admin/settings/roles` — staff accounts and the role × permission matrix (STAFF_MANAGE). */
export default function AdminRolesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.STAFF_MANAGE}>
      <RolesView />
    </RequirePermission>
  );
}
