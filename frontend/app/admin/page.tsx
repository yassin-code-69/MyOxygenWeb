"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminPageSkeleton } from "../../components/admin/AdminScreens";
import { ForbiddenPanel } from "../../components/admin/ForbiddenPanel";
import { DashboardView } from "../../components/admin/dashboard/DashboardView";
import { useCan } from "../../hooks/admin/use-permission";
import { getAdminHomeHref } from "../../lib/admin-nav";
import { useAuthStore } from "../../lib/auth-store";
import { PERMISSIONS } from "../../types/auth";

/** `/admin` — dashboard for roles with ANALYTICS_READ; others are sent to their first allowed page. */
export default function AdminDashboardPage() {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role ?? null);
  const canAnalytics = useCan(PERMISSIONS.ANALYTICS_READ);
  const homeHref = getAdminHomeHref(role);
  const redirectTo = !canAnalytics && homeHref && homeHref !== "/admin" ? homeHref : null;

  useEffect(() => {
    if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router]);

  if (redirectTo) {
    return <AdminPageSkeleton />;
  }
  if (!canAnalytics) {
    return <ForbiddenPanel permission={PERMISSIONS.ANALYTICS_READ} />;
  }
  return <DashboardView />;
}
