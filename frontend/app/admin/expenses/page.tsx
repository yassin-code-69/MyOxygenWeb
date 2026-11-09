"use client";

import { ExpensesView } from "../../../components/admin/expenses/ExpensesView";
import { RequireSuperAdmin } from "../../../components/admin/reports/RequireSuperAdmin";

/** `/admin/expenses` — operating expenses (SUPER_ADMIN only). `?new=1` opens the create form. */
export default function ExpensesPage() {
  return (
    <RequireSuperAdmin area="Operating expenses">
      <ExpensesView />
    </RequireSuperAdmin>
  );
}
