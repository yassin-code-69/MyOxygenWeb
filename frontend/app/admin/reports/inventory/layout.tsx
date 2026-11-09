import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Inventory Report" };

export default function InventoryReportLayout({ children }: { children: ReactNode }) {
  return children;
}
