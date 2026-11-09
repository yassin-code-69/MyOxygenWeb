"use client";

import { RequirePermission } from "../../../components/admin/RequirePermission";
import { CustomersView } from "../../../components/admin/customers/CustomersView";
import { PERMISSIONS } from "../../../types/auth";

/** `/admin/customers` — customer accounts with order history (ORDERS_READ). */
export default function AdminCustomersPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ORDERS_READ}>
      <CustomersView />
    </RequirePermission>
  );
}
