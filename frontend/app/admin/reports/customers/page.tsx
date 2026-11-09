"use client";

import { RequirePermission } from "../../../../components/admin/RequirePermission";
import { CustomersReportView } from "../../../../components/admin/reports/customers/CustomersReportView";
import { PERMISSIONS } from "../../../../types/auth";

/** `/admin/reports/customers` — new, returning and top customers (ANALYTICS_READ). */
export default function CustomerReportPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ANALYTICS_READ}>
      <CustomersReportView />
    </RequirePermission>
  );
}
