import "@mantine/charts/styles.css";
import "@mantine/spotlight/styles.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import packageJson from "../../package.json";
import { AdminShell } from "../../components/admin/AdminShell";

export const metadata: Metadata = {
  title: {
    absolute: "Dashboard · My Oxygen Admin",
    template: "%s · My Oxygen Admin",
  },
  description: "My Oxygen store back-office.",
  robots: { index: false, follow: false },
};

/**
 * Every `/admin` route renders inside the guarded back-office shell.
 * The version is read from package.json here (a server component), so only
 * the string reaches the client bundle.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell version={packageJson.version}>{children}</AdminShell>;
}
