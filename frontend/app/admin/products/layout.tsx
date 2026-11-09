import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Products" };

export default function ProductsLayout({ children }: { children: ReactNode }) {
  return children;
}
