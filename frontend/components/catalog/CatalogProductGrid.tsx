"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { IconMoodEmpty, IconRefresh, IconWifiOff } from "@tabler/icons-react";
import { BrandButton } from "../BrandButton";
import { EmptyState } from "../EmptyState";
import { ProductCard } from "../ProductCard";
import { ProductCardSkeleton } from "../ProductCardSkeleton";
import { fadeInUp, staggerContainer } from "../../lib/animations";
import { getErrorMessage } from "../../lib/api-client";
import { toProductCardData } from "./product-mappers";
import type { CatalogProductDTO } from "../../types/catalog";
import classes from "./CatalogExplorer.module.css";

/** Cards in the first row(s) load eagerly (largest grid has 4 columns). */
const PRIORITY_CARDS = 4;

/** Explorer grid: 2 columns on phones, 3 on tablets / with the sidebar, 4 on wide screens. */
const GRID_IMAGE_SIZES = "(max-width: 48em) 50vw, (max-width: 75em) 33vw, 260px";

export interface CatalogProductGridProps {
  products: CatalogProductDTO[];
  isLoading: boolean;
  error: unknown;
  /** Skeleton count (one page). */
  pageSize: number;
  /** Changes whenever the result set changes (re-runs the stagger). */
  resultKey: string;
  hideCategory?: boolean;
  onRetry: () => void;
  onAddToCart: (product: CatalogProductDTO) => void;
  /** Shown in the empty state (e.g. "Clear filters"). */
  emptyAction?: ReactNode;
  emptyDescription?: ReactNode;
}

/** Product grid with matching skeletons, a retryable error state and an empty state. */
export function CatalogProductGrid({
  products,
  isLoading,
  error,
  pageSize,
  resultKey,
  hideCategory = false,
  onRetry,
  onAddToCart,
  emptyAction,
  emptyDescription = "Try a different search or adjust the filters.",
}: CatalogProductGridProps) {
  if (isLoading) {
    return (
      <div className={classes.grid} aria-busy="true" aria-label="Loading products">
        <ProductCardSkeleton count={pageSize} />
      </div>
    );
  }

  if (error && products.length === 0) {
    return (
      <EmptyState
        icon={<IconWifiOff stroke={1.6} />}
        color="danger"
        title="We couldn't load the products"
        description={getErrorMessage(error)}
        action={
          <BrandButton variant="outline" leftSection={<IconRefresh size={16} aria-hidden />} onClick={onRetry}>
            Try again
          </BrandButton>
        }
      />
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<IconMoodEmpty stroke={1.6} />}
        title="No products match"
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <motion.ul
      key={resultKey}
      className={classes.grid}
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {products.map((product, index) => (
        // First-row cards render immediately (they may be the LCP element); the rest stagger in.
        <motion.li
          key={product.id}
          className={classes.gridItem}
          variants={index < PRIORITY_CARDS ? undefined : fadeInUp}
        >
          <ProductCard
            product={toProductCardData(product, { hideCategory })}
            priority={index < PRIORITY_CARDS}
            sizes={GRID_IMAGE_SIZES}
            onAddToCart={() => {
              onAddToCart(product);
            }}
          />
        </motion.li>
      ))}
    </motion.ul>
  );
}
