import { Suspense } from "react";
import { MyOrdersSkeleton, MyOrdersView } from "../../components/orders/MyOrdersView";
import { StorefrontShell } from "../../components/storefront/StorefrontShell";

/** `/orders` — the signed-in customer's order history (`?page=` for pagination). */
export default function MyOrdersPage() {
  return (
    <StorefrontShell>
      <Suspense fallback={<MyOrdersSkeleton />}>
        <MyOrdersView />
      </Suspense>
    </StorefrontShell>
  );
}
