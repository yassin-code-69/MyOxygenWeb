import { Suspense } from "react";
import { AuthCardSkeleton } from "../../components/auth/AuthCard";
import { RegisterForm } from "../../components/auth/RegisterForm";
import { StorefrontShell } from "../../components/storefront/StorefrontShell";

/** `/register` — reads `?redirect=` (search params need a Suspense boundary). */
export default function RegisterPage() {
  return (
    <StorefrontShell>
      <Suspense fallback={<AuthCardSkeleton fields={5} />}>
        <RegisterForm />
      </Suspense>
    </StorefrontShell>
  );
}
