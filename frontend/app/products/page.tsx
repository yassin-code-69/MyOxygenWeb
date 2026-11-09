import { Suspense } from "react";
import { CatalogExplorer, CatalogExplorerFallback } from "../../components/catalog/CatalogExplorer";
import { StorefrontShell } from "../../components/storefront/StorefrontShell";

/**
 * `/products` — the catalog explorer. Filters live in the URL
 * (`?q=&category=&brand=&minPrice=&maxPrice=&inStockOnly=&sort=&page=`).
 */
export default function ProductsPage() {
  return (
    <StorefrontShell footerProps={{ mt: 48, showAccentStrip: true }}>
      <Suspense fallback={<CatalogExplorerFallback />}>
        <CatalogExplorer />
      </Suspense>
    </StorefrontShell>
  );
}
