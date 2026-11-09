import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersLayout({ children }: { children: ReactNode }) {
  return children;
}
