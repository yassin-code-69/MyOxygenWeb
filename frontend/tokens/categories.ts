import { brand } from "./colors";

/**
 * The four storefront pillars. `color` is the category accent (brand token).
 * `iconUrl` points to static assets in `public/icons`.
 */
export const coreCategories = [
  {
    name: "Newborn",
    slug: "newborn",
    tagline: "Gentle Care for Little Ones",
    badge: "Essentials for your little bundle of joy",
    iconUrl: "/icons/newborn.svg",
    color: brand.primary,
  },
  {
    name: "Mother Care",
    slug: "mother-care",
    tagline: "Care for Every Stage of Motherhood",
    badge: "Complete care for healthy motherhood",
    iconUrl: "/icons/mother-care.svg",
    color: brand.secondary,
  },
  {
    name: "Skin Care",
    slug: "skin-care",
    tagline: "Be Confident Naturally",
    badge: "Natural care for your glowing skin",
    iconUrl: "/icons/skin-care.svg",
    color: brand.accent,
  },
  {
    name: "Inner Wear",
    slug: "inner-wear",
    tagline: "Comfort & Care Every Day",
    badge: "Comfortable & confident every day",
    iconUrl: "/icons/inner-wear.svg",
    color: brand.primary,
  },
] as const;

export type CoreCategory = (typeof coreCategories)[number];
export type CoreCategorySlug = CoreCategory["slug"];
