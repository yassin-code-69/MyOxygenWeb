import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesLayout({ children }: { children: ReactNode }) {
  return children;
}
