import { ProductDetailView } from "../../../components/catalog/ProductDetailView";
import { StorefrontShell } from "../../../components/storefront/StorefrontShell";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

/** `/products/[slug]` — product detail (gallery, batch transparency, purchase panel, tabs, related). */
export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;

  return (
    <StorefrontShell>
      <ProductDetailView slug={slug} />
    </StorefrontShell>
  );
}
