import type { ReactNode } from "react";
import type { Metadata } from "next";

interface OrderLayoutProps {
  children: ReactNode;
  params: Promise<{ orderNumber: string }>;
}

function readableReference(raw: string): string {
  try {
    const value = decodeURIComponent(raw);
    return /^[A-Za-z0-9-]{1,64}$/.test(value) ? value : "details";
  } catch {
    return "details";
  }
}

export async function generateMetadata({ params }: Pick<OrderLayoutProps, "params">): Promise<Metadata> {
  const { orderNumber } = await params;
  return {
    title: `Order ${readableReference(orderNumber)}`,
    robots: { index: false, follow: false },
  };
}

export default function OrderLayout({ children }: OrderLayoutProps) {
  return children;
}
