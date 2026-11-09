"use client";

import { RequirePermission } from "../../../../components/admin/RequirePermission";
import { InventoryReportView } from "../../../../components/admin/reports/inventory/InventoryReportView";
import { PERMISSIONS } from "../../../../types/auth";

/** `/admin/reports/inventory` — stock value, low, expiring and dead stock (ANALYTICS_READ). */
export default function InventoryReportPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ANALYTICS_READ}>
      <InventoryReportView />
    </RequirePermission>
  );
}
