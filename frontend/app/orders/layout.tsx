import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Orders",
  description: "Your My Oxygen orders, delivery status and invoices.",
  robots: { index: false, follow: false },
};

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return children;
}
