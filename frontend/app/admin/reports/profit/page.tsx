"use client";

import { RequireSuperAdmin } from "../../../../components/admin/reports/RequireSuperAdmin";
import { ProfitReportView } from "../../../../components/admin/reports/profit/ProfitReportView";

/** `/admin/reports/profit` — profit & margin (SUPER_ADMIN only). */
export default function ProfitReportPage() {
  return (
    <RequireSuperAdmin area="Profit and margin figures">
      <ProfitReportView />
    </RequireSuperAdmin>
  );
}
