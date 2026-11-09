import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to My Oxygen to check out, track your orders and download invoices.",
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
