import { PLACEHOLDER_IMAGE } from "../../lib/image-config.mjs";
import type { CartItemDraft } from "../../types/cart";
import type { CatalogProductDTO, ProductCardData } from "../../types/catalog";

export interface CardMappingOptions {
  /** Hide the category pill (e.g. on a category landing page where every card shares it). */
  hideCategory?: boolean;
}

/** `CatalogProductDTO` → `ProductCard` view-model (only real fields; nothing invented). */
export function toProductCardData(
  product: CatalogProductDTO,
  { hideCategory = false }: CardMappingOptions = {}
): ProductCardData {
  const discounted = product.discountAmount > 0 && product.effectivePrice < product.basePrice;
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    image: product.images[0] ?? null,
    images: product.images,
    basePrice: product.basePrice,
    effectivePrice: product.effectivePrice,
    discountPercentage: discounted ? product.discountPercent : null,
    categoryName: hideCategory ? null : product.category.name,
    categorySlug: hideCategory ? null : product.category.slug,
    brand: product.brand,
    totalAvailable: product.totalStock,
    isLowStock: product.isLowStock,
    isOutOfStock: product.isOutOfStock || product.totalStock <= 0,
    earliestExpiry: product.requiresBatchTracking ? product.earliestExpiry : null,
  };
}

/** `CatalogProductDTO` → cart line draft (`useCartStore().addItem`). */
export function toCartItemDraft(product: CatalogProductDTO, quantity = 1): CartItemDraft {
  const discounted = product.effectivePrice < product.basePrice;
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    image: product.images[0] ?? PLACEHOLDER_IMAGE,
    unitPrice: product.effectivePrice,
    originalPrice: discounted ? product.basePrice : undefined,
    requiresBatchTracking: product.requiresBatchTracking,
    earliestExpiry: product.earliestExpiry,
    maxStock: product.totalStock,
    quantity,
  };
}

/** True when the product can be added to the cart. */
export function isPurchasable(product: CatalogProductDTO): boolean {
  return !product.isOutOfStock && product.totalStock > 0;
}
