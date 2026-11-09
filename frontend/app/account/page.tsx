import { AccountView } from "../../components/auth/AccountView";
import { StorefrontShell } from "../../components/storefront/StorefrontShell";

/** `/account` — signed-in profile, shortcuts and sign-out. */
export default function AccountPage() {
  return (
    <StorefrontShell>
      <AccountView />
    </StorefrontShell>
  );
}
