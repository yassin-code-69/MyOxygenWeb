"use client";

import { RequirePermission } from "../../../../components/admin/RequirePermission";
import { RefundsView } from "../../../../components/admin/payments/RefundsView";
import { PERMISSIONS } from "../../../../types/auth";

/** `/admin/payments/refunds` — refunded orders in a period (ORDERS_READ). */
export default function AdminRefundsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ORDERS_READ}>
      <RefundsView />
    </RequirePermission>
  );
}
