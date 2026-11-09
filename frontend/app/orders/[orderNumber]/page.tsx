import { Suspense } from "react";
import { OrderDetailView } from "../../../components/orders/OrderDetailView";
import { OrderDetailSkeleton } from "../../../components/orders/OrderStates";
import { StorefrontShell } from "../../../components/storefront/StorefrontShell";

interface OrderPageProps {
  params: Promise<{ orderNumber: string }>;
}

function decodeReference(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** `/orders/[orderNumber]` — order detail (`?placed=1` shows the order-placed celebration). */
export default async function OrderPage({ params }: OrderPageProps) {
  const { orderNumber } = await params;
  return (
    <StorefrontShell>
      <Suspense fallback={<OrderDetailSkeleton />}>
        <OrderDetailView orderNumber={decodeReference(orderNumber)} />
      </Suspense>
    </StorefrontShell>
  );
}
