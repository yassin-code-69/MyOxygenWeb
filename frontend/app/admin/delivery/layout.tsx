import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Delivery & Tracking" };

export default function DeliveryLayout({ children }: { children: ReactNode }) {
  return children;
}
