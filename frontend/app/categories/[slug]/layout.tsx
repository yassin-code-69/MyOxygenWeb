import type { ReactNode } from "react";
import type { Metadata } from "next";
import { humanizeSlug } from "../../../components/storefront/slug";

interface CategoryLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

/** Title from the slug (no network call; the page itself loads the real category). */
export async function generateMetadata({ params }: Pick<CategoryLayoutProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const name = humanizeSlug(slug);
  return {
    title: name,
    description: `Shop ${name} at My Oxygen — trusted mother & baby care delivered across Bangladesh.`,
    alternates: { canonical: `/categories/${slug}` },
  };
}

export default function CategoryLayout({ children }: CategoryLayoutProps) {
  return children;
}
