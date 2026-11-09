import type { CSSProperties } from "react";
import { Paper, Skeleton } from "@mantine/core";
import classes from "./ProductCard.module.css";

export interface ProductCardSkeletonProps {
  /** Number of skeleton cards to render (rendered as siblings, e.g. inside a SimpleGrid). */
  count?: number;
  /** Match a ProductCard rendered with `onAddToCart` (CTA row). Default `true`. */
  withAction?: boolean;
  className?: string;
  style?: CSSProperties;
}

function SkeletonCard({
  withAction,
  className,
  style,
}: Omit<ProductCardSkeletonProps, "count">) {
  return (
    <Paper
      radius="md"
      shadow="card"
      withBorder
      p="sm"
      className={[classes.card, classes.static, className].filter(Boolean).join(" ")}
      style={style}
      aria-hidden
    >
      <div className={classes.topRow}>
        <Skeleton height={20} width={44} radius="xl" />
        <Skeleton height={24} width={24} circle />
      </div>

      <div className={classes.media}>
        <Skeleton height="100%" radius={12} />
      </div>

      <div className={classes.body}>
        {/* Title: one line at 0.92rem × 1.3 line-height */}
        <Skeleton height="calc(0.92rem * 1.3)" width="80%" radius="xl" />
        <div className={classes.metaRow}>
          <Skeleton height={16} width={64} radius="xl" />
        </div>
        <div className={classes.priceRow}>
          <Skeleton height={20} width="45%" radius="xl" />
        </div>
      </div>

      {withAction ? <Skeleton className={classes.cta} height={38} radius="xl" /> : null}
    </Paper>
  );
}

/**
 * Zero-CLS placeholder sharing ProductCard's CSS module, so the outer box, the
 * 1:1 image area, row heights and the CTA height are identical to the loaded card.
 * Uses the warm `#FDE8EC → #FFF5F8` shimmer (see `app/globals.css`).
 */
export function ProductCardSkeleton({
  count = 1,
  withAction = true,
  className,
  style,
}: ProductCardSkeletonProps) {
  const total = Math.max(1, Math.floor(count));
  return (
    <>
      {Array.from({ length: total }, (_, index) => (
        <SkeletonCard key={index} withAction={withAction} className={className} style={style} />
      ))}
    </>
  );
}
