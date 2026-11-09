import type { ReactNode } from "react";
import type { Metadata } from "next";

interface TrackLayoutProps {
  children: ReactNode;
  params: Promise<{ orderNumber: string }>;
}

function readableReference(raw: string): string {
  try {
    const value = decodeURIComponent(raw);
    return /^[A-Za-z0-9-]{1,64}$/.test(value) ? value : "";
  } catch {
    return "";
  }
}

export async function generateMetadata({ params }: Pick<TrackLayoutProps, "params">): Promise<Metadata> {
  const { orderNumber } = await params;
  const reference = readableReference(orderNumber);
  return {
    title: reference ? `Track order ${reference}` : "Track order",
    robots: { index: false, follow: false },
  };
}

export default function TrackLayout({ children }: TrackLayoutProps) {
  return children;
}
