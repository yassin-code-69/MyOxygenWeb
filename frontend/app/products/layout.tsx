import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Shop newborn essentials, mother care, skin care and inner wear. Batch-tracked freshness, cash on delivery and free delivery from ৳1,500 across Bangladesh.",
  alternates: { canonical: "/products" },
};

export default function ProductsLayout({ children }: { children: ReactNode }) {
  return children;
}
