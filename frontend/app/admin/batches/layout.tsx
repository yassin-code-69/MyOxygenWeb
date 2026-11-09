import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Batches" };

export default function BatchesLayout({ children }: { children: ReactNode }) {
  return children;
}
