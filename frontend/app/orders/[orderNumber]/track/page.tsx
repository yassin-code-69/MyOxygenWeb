import { OrderTrackingView } from "../../../../components/orders/OrderTrackingView";
import { StorefrontShell } from "../../../../components/storefront/StorefrontShell";

interface TrackPageProps {
  params: Promise<{ orderNumber: string }>;
}

function decodeReference(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** `/orders/[orderNumber]/track` — courier status and status history. */
export default async function TrackOrderPage({ params }: TrackPageProps) {
  const { orderNumber } = await params;
  return (
    <StorefrontShell>
      <OrderTrackingView orderNumber={decodeReference(orderNumber)} />
    </StorefrontShell>
  );
}
