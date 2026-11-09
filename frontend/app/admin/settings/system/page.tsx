"use client";

import { RequirePermission } from "../../../../components/admin/RequirePermission";
import { SystemStatusView } from "../../../../components/admin/settings/SystemStatusView";
import { PERMISSIONS } from "../../../../types/auth";

/** `/admin/settings/system` — API, database, jobs and integrations status (STAFF_MANAGE). */
export default function AdminSystemPage() {
  return (
    <RequirePermission permission={PERMISSIONS.STAFF_MANAGE}>
      <SystemStatusView />
    </RequirePermission>
  );
}
