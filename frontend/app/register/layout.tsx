import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a My Oxygen customer account to check out faster and track your orders.",
  robots: { index: false, follow: true },
};

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return children;
}
