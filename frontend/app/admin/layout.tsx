import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AdminShell } from "../../components/admin/AdminShell";

export const metadata: Metadata = {
  title: {
    absolute: "Dashboard · My Oxygen Admin",
    template: "%s · My Oxygen Admin",
  },
  description: "My Oxygen store back-office.",
  robots: { index: false, follow: false },
};

/** Every `/admin` route renders inside the guarded back-office shell. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
