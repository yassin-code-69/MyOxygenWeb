import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Transactions" };

export default function PaymentsLayout({ children }: { children: ReactNode }) {
  return children;
}
