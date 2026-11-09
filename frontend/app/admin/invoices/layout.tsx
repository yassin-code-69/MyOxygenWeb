import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesLayout({ children }: { children: ReactNode }) {
  return children;
}
