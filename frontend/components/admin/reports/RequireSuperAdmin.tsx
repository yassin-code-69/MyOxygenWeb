"use client";

import type { ReactNode } from "react";
import { useAdminRole } from "../../../hooks/admin/use-permission";
import { canAccessNavEntry } from "../../../lib/admin-nav";
import { ForbiddenPanel } from "../ForbiddenPanel";
import { roleLabel } from "../format";

export interface RequireSuperAdminProps {
  /** What the page shows ("Profit & margin figures"), for the 403 message. */
  area: string;
  children: ReactNode;
}

/**
 * Renders `children` only for SUPER_ADMIN (profit, expenses). Children and
 * their data hooks never mount for other roles, so nothing the API would
 * reject is requested. (`RequirePermission` checks permissions, not roles.)
 */
export function RequireSuperAdmin({ area, children }: RequireSuperAdminProps) {
  const role = useAdminRole();
  if (canAccessNavEntry(role, { superAdminOnly: true })) {
    return children;
  }
  return (
    <ForbiddenPanel
      title="Owner-only page"
      message={`${area} are visible to the store owner (Super admin) only${role ? ` — you're signed in as ${roleLabel(role).toLowerCase()}` : ""}. Ask the owner if you need these numbers.`}
    />
  );
}
