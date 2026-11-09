import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Customer Report" };

export default function CustomerReportLayout({ children }: { children: ReactNode }) {
  return children;
}
