"use client";

import { RequirePermission } from "../../../components/admin/RequirePermission";
import { DeliveryView } from "../../../components/admin/delivery/DeliveryView";
import { PERMISSIONS } from "../../../types/auth";

/** `/admin/delivery` — fulfilment queues, courier load and shipment tracking (ORDERS_READ). */
export default function AdminDeliveryPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ORDERS_READ}>
      <DeliveryView />
    </RequirePermission>
  );
}
