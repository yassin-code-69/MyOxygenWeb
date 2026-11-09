import { CheckoutView } from "../../components/checkout/CheckoutView";
import { StorefrontShell } from "../../components/storefront/StorefrontShell";

/** `/checkout` — signed-in customers only (guests are sent to `/login?redirect=/checkout`). */
export default function CheckoutPage() {
  return (
    <StorefrontShell>
      <CheckoutView />
    </StorefrontShell>
  );
}
