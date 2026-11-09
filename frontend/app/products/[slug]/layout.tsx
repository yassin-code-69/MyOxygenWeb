import type { ReactNode } from "react";
import type { Metadata } from "next";
import { humanizeSlug } from "../../../components/storefront/slug";

interface ProductLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

/**
 * Title from the slug (product slugs are generated from the title). No server-side API
 * call: in Docker the public API origin is not reachable from the frontend container.
 */
export async function generateMetadata({ params }: Pick<ProductLayoutProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: humanizeSlug(slug),
    alternates: { canonical: `/products/${slug}` },
  };
}

export default function ProductLayout({ children }: ProductLayoutProps) {
  return children;
}
