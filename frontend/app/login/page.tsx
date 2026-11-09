import { Suspense } from "react";
import { AuthCardSkeleton } from "../../components/auth/AuthCard";
import { LoginForm } from "../../components/auth/LoginForm";
import { StorefrontShell } from "../../components/storefront/StorefrontShell";

/** `/login` — reads `?redirect=` (search params need a Suspense boundary). */
export default function LoginPage() {
  return (
    <StorefrontShell>
      <Suspense fallback={<AuthCardSkeleton fields={2} />}>
        <LoginForm />
      </Suspense>
    </StorefrontShell>
  );
}
