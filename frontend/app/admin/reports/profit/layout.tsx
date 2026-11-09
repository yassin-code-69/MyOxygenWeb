import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Profit & Margin" };

export default function ProfitReportLayout({ children }: { children: ReactNode }) {
  return children;
}
