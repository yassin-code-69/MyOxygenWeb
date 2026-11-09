import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Brands" };

export default function BrandsLayout({ children }: { children: ReactNode }) {
  return children;
}
