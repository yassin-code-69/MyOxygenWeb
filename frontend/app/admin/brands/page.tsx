"use client";

import { RequirePermission } from "../../../components/admin/RequirePermission";
import { BrandsView } from "../../../components/admin/brands/BrandsView";
import { PERMISSIONS } from "../../../types/auth";

/** `/admin/brands` — brands across the catalog (PRODUCTS_READ; rename / merge needs PRODUCTS_WRITE). */
export default function AdminBrandsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.PRODUCTS_READ}>
      <BrandsView />
    </RequirePermission>
  );
}
