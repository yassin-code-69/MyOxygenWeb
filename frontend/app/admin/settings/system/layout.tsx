import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "System Settings" };

export default function SystemLayout({ children }: { children: ReactNode }) {
  return children;
}
