import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Discounts" };

export default function DiscountsLayout({ children }: { children: ReactNode }) {
  return children;
}
