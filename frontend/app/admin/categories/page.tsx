"use client";

import { RequirePermission } from "../../../components/admin/RequirePermission";
import { CategoriesView } from "../../../components/admin/categories/CategoriesView";
import { PERMISSIONS } from "../../../types/auth";

/** `/admin/categories` — storefront categories (PRODUCTS_READ; changes need PRODUCTS_WRITE). */
export default function AdminCategoriesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.PRODUCTS_READ}>
      <CategoriesView />
    </RequirePermission>
  );
}
