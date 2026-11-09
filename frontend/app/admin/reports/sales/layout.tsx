import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sales Report" };

export default function SalesReportLayout({ children }: { children: ReactNode }) {
  return children;
}
