"use client";

import { RequirePermission } from "../../../components/admin/RequirePermission";
import { PaymentsView } from "../../../components/admin/payments/PaymentsView";
import { PERMISSIONS } from "../../../types/auth";

/** `/admin/payments` — transactions: collected, pending COD, refunded and failed payments (ORDERS_READ). */
export default function AdminPaymentsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ORDERS_READ}>
      <PaymentsView />
    </RequirePermission>
  );
}
