import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return children;
}
