import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Stock Ledger" };

export default function LedgerLayout({ children }: { children: ReactNode }) {
  return children;
}
