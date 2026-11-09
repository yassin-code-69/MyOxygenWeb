"use client";

import { RequirePermission } from "../../../../components/admin/RequirePermission";
import { ProductsReportView } from "../../../../components/admin/reports/products/ProductsReportView";
import { PERMISSIONS } from "../../../../types/auth";

/** `/admin/reports/products` — product performance (ANALYTICS_READ). */
export default function ProductReportPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ANALYTICS_READ}>
      <ProductsReportView />
    </RequirePermission>
  );
}
