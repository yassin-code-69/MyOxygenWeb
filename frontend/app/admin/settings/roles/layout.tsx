import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin Roles" };

export default function RolesLayout({ children }: { children: ReactNode }) {
  return children;
}
