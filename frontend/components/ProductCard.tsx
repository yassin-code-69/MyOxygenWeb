"use client";

import { useId, useState, type CSSProperties, type MouseEvent } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Rating,
  Text,
  VisuallyHidden,
  type MantineColor,
} from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import {
  IconCalendarTime,
  IconHeart,
  IconHeartFilled,
  IconShoppingCart,
} from "@tabler/icons-react";
import { ImageWithFallback } from "./ImageWithFallback";
import { Price } from "./Price";
import { discountPercent, formatMonthYear, toNumber } from "../lib/format";
import { semantic } from "../tokens";
import type { ProductCardData } from "../types/catalog";
import classes from "./ProductCard.module.css";

export type { ProductCardData };

/** Default responsive `sizes` for a 2 → 3 → 4 column product grid. */
export const PRODUCT_CARD_IMAGE_SIZES =
  "(max-width: 36em) 50vw, (max-width: 62em) 33vw, (max-width: 88em) 25vw, 300px";

/** Category slug → accent color for the category pill. */
const CATEGORY_COLORS: Record<string, MantineColor> = {
  newborn: "primaryPink",
  "mother-care": "secondaryGreen",
  "skin-care": "accentPurple",
  "inner-wear": "primaryPink",
};

interface ProductCardSharedProps {
  /**
   * Called when "Add to cart" is pressed. Return a Promise to show the button's
   * loading state until it settles. Cart logic stays with the caller.
   */
  onAddToCart?: (product: ProductCardData) => void | Promise<unknown>;
  /** Controlled loading state for the add-to-cart button. */
  addingToCart?: boolean;
  /** Renders the wishlist heart when provided. */
  onToggleWishlist?: (product: ProductCardData, nextValue: boolean) => void;
  /** Controlled wishlist state (uncontrolled when omitted). */
  isWishlisted?: boolean;
  /** Link target. Defaults to `/products/{slug}`. */
  href?: string;
  /** Above-the-fold card: loads the image eagerly with high fetch priority (protects LCP). */
  priority?: boolean;
  /** next/image `sizes`. Defaults to `PRODUCT_CARD_IMAGE_SIZES`. */
  sizes?: string;
  /** Button label override (e.g. "Add"). */
  addToCartLabel?: string;
  /**
   * @deprecated The whole card is now a link to the product page; this callback is ignored.
   */
  onCardClick?: (productId: string) => void;
  className?: string;
  style?: CSSProperties;
}

export interface ProductCardProps extends ProductCardSharedProps {
  product: ProductCardData;
}

/**
 * @deprecated Flat props kept so pre-refactor pages compile. Pass `product={...}` instead.
 */
export interface LegacyProductCardProps extends ProductCardSharedProps {
  product?: undefined;
  id: string;
  title: string;
  slug?: string;
  image: string;
  category?: string;
  basePrice: number | string;
  effectivePrice?: number | string;
  discountPercentage?: number;
  /** Ignored for display — expiry is shown only when `batchExpiry` is provided. */
  requiresBatchTracking?: boolean;
  batchExpiry?: string | Date;
  rating?: number;
  reviewsCount?: number;
  inStock?: boolean;
}

function fromLegacyProps(props: LegacyProductCardProps): ProductCardData {
  const expiry =
    props.batchExpiry instanceof Date ? props.batchExpiry.toISOString() : props.batchExpiry;
  return {
    id: props.id,
    title: props.title,
    slug: props.slug || props.id,
    image: props.image,
    categoryName: props.category ?? null,
    basePrice: props.basePrice,
    effectivePrice: props.effectivePrice ?? null,
    discountPercentage: props.discountPercentage ?? null,
    inStock: props.inStock,
    earliestExpiry: expiry ?? null,
    rating: props.rating ?? null,
    reviewCount: props.reviewsCount ?? null,
  };
}

function isLegacyProps(
  props: ProductCardProps | LegacyProductCardProps
): props is LegacyProductCardProps {
  return props.product === undefined;
}

function isOutOfStock(product: ProductCardData): boolean {
  if (product.isOutOfStock !== undefined) {
    return product.isOutOfStock;
  }
  if (product.inStock !== undefined) {
    return !product.inStock;
  }
  if (typeof product.totalAvailable === "number") {
    return product.totalAvailable <= 0;
  }
  return false;
}

/**
 * THE product card (storefront grids, related products, featured rails).
 *
 * - Whole card links to the product page (stretched-link pattern; buttons sit above it).
 * - Shows only real data: expiry when `earliestExpiry` exists, rating when `rating` exists.
 * - Effective price + struck base price + discount pill; low / out-of-stock badges.
 */
export function ProductCard(props: ProductCardProps | LegacyProductCardProps) {
  const {
    onAddToCart,
    addingToCart,
    onToggleWishlist,
    isWishlisted,
    href,
    priority = false,
    sizes = PRODUCT_CARD_IMAGE_SIZES,
    addToCartLabel = "Add to Cart",
    className,
    style,
  } = props;

  const product: ProductCardData = isLegacyProps(props) ? fromLegacyProps(props) : props.product;
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [wishlisted, setWishlisted] = useUncontrolled({
    value: isWishlisted,
    defaultValue: false,
    finalValue: false,
  });

  const basePrice = toNumber(product.basePrice);
  const effectivePrice = toNumber(product.effectivePrice, basePrice);
  const discount =
    typeof product.discountPercentage === "number" && product.discountPercentage > 0
      ? Math.round(product.discountPercentage)
      : discountPercent(basePrice, effectivePrice);
  const outOfStock = isOutOfStock(product);
  const lowStock = !outOfStock && product.isLowStock === true;
  const expiryLabel = formatMonthYear(product.earliestExpiry);
  const hasRating = typeof product.rating === "number" && product.rating > 0;
  const imageSrc = product.image || product.images?.[0] || null;
  const productHref = href ?? `/products/${encodeURIComponent(product.slug || product.id)}`;
  const categoryColor: MantineColor =
    (product.categorySlug && CATEGORY_COLORS[product.categorySlug]) || "primaryPink";
  const isLoading = addingToCart ?? pending;

  const handleAddToCart = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!onAddToCart || outOfStock || isLoading) {
      return;
    }
    const result = onAddToCart(product);
    if (result instanceof Promise) {
      setPending(true);
      try {
        await result;
      } finally {
        setPending(false);
      }
    }
  };

  const handleToggleWishlist = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const next = !wishlisted;
    setWishlisted(next);
    onToggleWishlist?.(product, next);
  };

  return (
    <Paper
      component="article"
      aria-labelledby={titleId}
      radius="md"
      shadow="card"
      withBorder
      p="sm"
      className={className ? `${classes.card} ${className}` : classes.card}
      style={style}
    >
      <div className={classes.topRow}>
        {discount > 0 ? (
          <Badge variant="filled" color="primaryPink.8" size="sm" className={classes.discount}>
            -{discount}%<VisuallyHidden> off</VisuallyHidden>
          </Badge>
        ) : (
          <span />
        )}

        {onToggleWishlist ? (
          <ActionIcon
            variant="subtle"
            color={wishlisted ? "primaryPink" : "gray"}
            size="md"
            className={classes.control}
            aria-pressed={wishlisted}
            aria-label={
              wishlisted ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`
            }
            onClick={handleToggleWishlist}
          >
            {wishlisted ? <IconHeartFilled size={18} /> : <IconHeart size={18} stroke={1.8} />}
          </ActionIcon>
        ) : null}
      </div>

      <div className={classes.media}>
        <ImageWithFallback
          src={imageSrc}
          alt={product.title}
          fill
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          className={outOfStock ? `${classes.image} ${classes.imageDimmed}` : classes.image}
        />
        {outOfStock ? (
          <Badge variant="filled" color="gray" size="sm" className={classes.stockBadge}>
            Out of stock
          </Badge>
        ) : null}
        {lowStock ? (
          <Badge variant="light" color="warning" size="sm" className={classes.stockBadge}>
            {typeof product.totalAvailable === "number" && product.totalAvailable > 0
              ? `Only ${product.totalAvailable} left`
              : "Low stock"}
          </Badge>
        ) : null}
      </div>

      <div className={classes.body}>
        <h3 id={titleId} className={classes.title} title={product.title}>
          <Link href={productHref} className={classes.titleLink}>
            {product.title}
          </Link>
        </h3>

        <div className={classes.metaRow}>
          {product.categoryName ? (
            <Badge variant="light" color={categoryColor} size="xs" radius="xl" tt="capitalize">
              {product.categoryName}
            </Badge>
          ) : null}
        </div>

        {hasRating ? (
          <Group
            gap={4}
            wrap="nowrap"
            role="img"
            aria-label={`Rated ${(product.rating ?? 0).toFixed(1)} out of 5${
              typeof product.reviewCount === "number" ? `, ${product.reviewCount} reviews` : ""
            }`}
          >
            <Rating value={product.rating ?? 0} fractions={2} readOnly size="xs" aria-hidden />
            <Text size="xs" c="dimmed" fw={500} aria-hidden>
              {(product.rating ?? 0).toFixed(1)}
              {typeof product.reviewCount === "number" ? ` (${product.reviewCount})` : ""}
            </Text>
          </Group>
        ) : null}

        {expiryLabel ? (
          <Group gap={4} wrap="nowrap">
            <IconCalendarTime size={14} color={semantic.textSuccess} aria-hidden />
            <Text size="xs" fw={600} c={semantic.textSuccess}>
              Best before {expiryLabel}
            </Text>
          </Group>
        ) : null}

        <div className={classes.priceRow}>
          <Price
            value={effectivePrice}
            compareAt={discount > 0 ? basePrice : null}
            tone="brand"
            size="md"
            fw={800}
          />
        </div>
      </div>

      {onAddToCart ? (
        <Button
          fullWidth
          size="sm"
          radius="xl"
          className={classes.cta}
          disabled={outOfStock}
          loading={isLoading}
          leftSection={<IconShoppingCart size={16} stroke={2.2} aria-hidden />}
          // Accessible name starts with the visible label (WCAG 2.5.3 Label in Name).
          aria-label={`${outOfStock ? "Out of stock" : addToCartLabel}: ${product.title}`}
          onClick={handleAddToCart}
        >
          {outOfStock ? "Out of stock" : addToCartLabel}
        </Button>
      ) : null}
    </Paper>
  );
}
