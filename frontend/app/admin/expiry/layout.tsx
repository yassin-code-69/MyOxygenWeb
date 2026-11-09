import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Expiry / FEFO" };

export default function ExpiryLayout({ children }: { children: ReactNode }) {
  return children;
}
