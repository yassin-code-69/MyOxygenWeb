import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesLayout({ children }: { children: ReactNode }) {
  return children;
}
