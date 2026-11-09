import { CategoryGrid } from "../components/CategoryGrid";
import { FeaturedProducts } from "../components/FeaturedProducts";
import { FeaturesBar } from "../components/FeaturesBar";
import { HeroBanner } from "../components/HeroBanner";
import { SpecialCareBanner } from "../components/SpecialCareBanner";
import { FlashSaleBanner } from "../components/storefront/FlashSaleBanner";
import { StorefrontShell } from "../components/storefront/StorefrontShell";

/**
 * Home. A server component: every section is a client component that fetches its own
 * live data (categories, flash sales, best sellers) through SWR hooks.
 */
export default function HomePage() {
  return (
    <StorefrontShell>
      <HeroBanner />
      <FeaturesBar />
      <CategoryGrid />
      <FlashSaleBanner />
      <FeaturedProducts />
      <SpecialCareBanner />
    </StorefrontShell>
  );
}
