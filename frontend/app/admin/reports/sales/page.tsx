"use client";

import { RequirePermission } from "../../../../components/admin/RequirePermission";
import { SalesReportView } from "../../../../components/admin/reports/sales/SalesReportView";
import { PERMISSIONS } from "../../../../types/auth";

/** `/admin/reports/sales` — sales overview for any period (ANALYTICS_READ). */
export default function SalesReportPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ANALYTICS_READ}>
      <SalesReportView />
    </RequirePermission>
  );
}
