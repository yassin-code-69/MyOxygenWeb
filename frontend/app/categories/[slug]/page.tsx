import { Suspense } from "react";
import { CatalogExplorer, CatalogExplorerFallback } from "../../../components/catalog/CatalogExplorer";
import { humanizeSlug } from "../../../components/storefront/slug";
import { StorefrontShell } from "../../../components/storefront/StorefrontShell";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * `/categories/[slug]` — the same explorer as `/products` with the category fixed.
 * An unknown slug renders the not-found page (the API answers 404).
 */
export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;

  return (
    <StorefrontShell footerProps={{ mt: 48, showAccentStrip: true }}>
      <Suspense fallback={<CatalogExplorerFallback title={humanizeSlug(slug)} />}>
        <CatalogExplorer categorySlug={slug} />
      </Suspense>
    </StorefrontShell>
  );
}
