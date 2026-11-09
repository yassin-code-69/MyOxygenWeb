import type { MantineColor } from "@mantine/core";
import {
  IconCategory2,
  IconHeartHandshake,
  IconMoodKid,
  IconShirt,
  IconSparkles,
  type Icon,
} from "@tabler/icons-react";
import { coreCategories } from "../../tokens/categories";
import type { CatalogCategoryDTO } from "../../types/catalog";

/**
 * Presentational assets for categories (artwork + marketing copy shipped with the
 * frontend). Data — names, slugs, counts, icons — always comes from the API; this only
 * decorates the categories the brand has artwork for and falls back gracefully.
 */
const CATEGORY_IMAGES: Readonly<Record<string, string>> = {
  newborn: "/images/cat-newborn.jpg",
  "mother-care": "/images/cat-mothercare.jpg",
  "skin-care": "/images/cat-skincare.jpg",
  "inner-wear": "/images/cat-innerwear.jpg",
};

const CATEGORY_ACCENTS: Readonly<Record<string, MantineColor>> = {
  newborn: "primaryPink",
  "mother-care": "secondaryGreen",
  "skin-care": "accentPurple",
  "inner-wear": "primaryPink",
};

const CATEGORY_GLYPHS: Readonly<Record<string, Icon>> = {
  newborn: IconMoodKid,
  "mother-care": IconHeartHandshake,
  "skin-care": IconSparkles,
  "inner-wear": IconShirt,
};

const ACCENT_CYCLE: readonly MantineColor[] = ["primaryPink", "secondaryGreen", "accentPurple"];

export interface CategoryVisual {
  /** Large photo for cards/banners (`null` → use the icon or a placeholder). */
  image: string | null;
  /** Small icon (API `iconUrl` first, then the bundled brand icon). */
  icon: string | null;
  /** Short marketing line, only for categories the brand wrote copy for. */
  tagline: string | null;
  description: string | null;
  /** Mantine color used for tints and accents. */
  accent: MantineColor;
  /** Tabler icon for compact lists (filters, menus). */
  glyph: Icon;
}

export function getCategoryVisual(
  category: Pick<CatalogCategoryDTO, "slug"> & { iconUrl?: string | null },
  index = 0
): CategoryVisual {
  const core = coreCategories.find((entry) => entry.slug === category.slug);
  return {
    image: CATEGORY_IMAGES[category.slug] ?? null,
    icon: category.iconUrl ?? core?.iconUrl ?? null,
    tagline: core?.tagline ?? null,
    description: core?.badge ?? null,
    accent: CATEGORY_ACCENTS[category.slug] ?? ACCENT_CYCLE[index % ACCENT_CYCLE.length],
    glyph: CATEGORY_GLYPHS[category.slug] ?? IconCategory2,
  };
}

/**
 * Categories for visual showcases (home grid, mobile strip, footer): only categories
 * that have products, with the ones the owner gave an icon first (stable — the API's
 * `sortOrder` is preserved inside each group).
 */
export function rankShowcaseCategories(categories: readonly CatalogCategoryDTO[]): CatalogCategoryDTO[] {
  const withProducts = categories.filter((category) => category.productCount > 0);
  return [
    ...withProducts.filter((category) => Boolean(category.iconUrl)),
    ...withProducts.filter((category) => !category.iconUrl),
  ];
}

export { humanizeSlug } from "./slug";

/** "1 product" / "12 products". */
export function formatProductCount(count: number): string {
  return `${count} ${count === 1 ? "product" : "products"}`;
}
