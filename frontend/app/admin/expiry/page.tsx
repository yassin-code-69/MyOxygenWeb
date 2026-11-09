"use client";

import { ExpiryView } from "../../../components/admin/expiry/ExpiryView";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import { PERMISSIONS } from "../../../types/auth";

/** `/admin/expiry` — Expiry / FEFO (BATCHES_MANAGE). Deep link: `?days=7|30|60|90`. */
export default function AdminExpiryPage() {
  return (
    <RequirePermission permission={PERMISSIONS.BATCHES_MANAGE}>
      <ExpiryView />
    </RequirePermission>
  );
}
