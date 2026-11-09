import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Refunds" };

export default function RefundsLayout({ children }: { children: ReactNode }) {
  return children;
}
