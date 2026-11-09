import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Product Report" };

export default function ProductReportLayout({ children }: { children: ReactNode }) {
  return children;
}
