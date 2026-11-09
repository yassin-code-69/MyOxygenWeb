"use client";

import { Box, Group, Skeleton, Text } from "@mantine/core";
import { IconShoppingBag } from "@tabler/icons-react";
import { EmptyState } from "../../EmptyState";
import { formatCount, formatMoney } from "../format";
import { ThumbCell } from "./ThumbCell";
import classes from "./kit.module.css";

export interface RankedItem {
  key: string;
  title: string;
  subtitle?: string | null;
  image?: string | null;
  /** Makes the title a link. */
  href?: string;
  /** Units sold (shown as "128 units"). */
  units?: number;
  /** Right-aligned amount in ৳ (or a count with `amountFormat="count"`). */
  amount?: number;
}

export interface RankedProductListProps {
  /** `undefined` while loading. */
  items: readonly RankedItem[] | undefined;
  loading?: boolean;
  /** Skeleton rows while loading. Default 5. */
  skeletonCount?: number;
  /** Show the 1, 2, 3 … rank column. Default true. */
  showRank?: boolean;
  /** Noun after the units count. Default "units". */
  unitsLabel?: string;
  amountFormat?: "currency" | "count";
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * Ranked rows: rank, thumbnail, title + subtitle, units, amount (mockup "Top
 * Selling Products"). Units hide on very narrow cards.
 *
 * ```tsx
 * <RankedProductList items={top.map((p) => ({ key: p.productId, title: p.title, subtitle: p.categoryName,
 *   image: p.image, units: p.unitsSold, amount: p.revenue }))} />
 * ```
 */
export function RankedProductList({
  items,
  loading = false,
  skeletonCount = 5,
  showRank = true,
  unitsLabel = "units",
  amountFormat = "currency",
  emptyTitle = "No sales yet",
  emptyDescription,
}: RankedProductListProps) {
  if (loading && !items) {
    return (
      <Box aria-hidden>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <Group key={index} gap="sm" wrap="nowrap" className={classes.listRow}>
            {showRank ? <Skeleton height={12} width={12} radius="xl" /> : null}
            <Skeleton height={40} width={40} radius="sm" />
            <Box style={{ flex: 1 }}>
              <Skeleton height={12} width="70%" radius="xl" />
              <Skeleton height={10} width="40%" radius="xl" mt={8} />
            </Box>
            <Skeleton height={12} width={64} radius="xl" />
          </Group>
        ))}
      </Box>
    );
  }
  if (!items || items.length === 0) {
    return <EmptyState withCard={false} size="sm" icon={<IconShoppingBag stroke={1.6} />} color="secondaryGreen" title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <Box component="ol" className={classes.list}>
      {items.map((item, index) => (
        <li key={item.key} className={classes.listRow}>
          {showRank ? (
            <span className={classes.rank} aria-hidden>
              {index + 1}
            </span>
          ) : null}
          <Box style={{ flex: "1 1 auto", minWidth: 0 }}>
            <ThumbCell image={item.image} title={item.title} subtitle={item.subtitle} href={item.href} />
          </Box>
          {item.units !== undefined ? (
            <Text size="xs" c="var(--mo-color-text-muted)" className="mo-tabular-nums" visibleFrom="xs" style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}>
              {formatCount(item.units)} {unitsLabel}
            </Text>
          ) : null}
          {item.amount !== undefined ? (
            <Text size="sm" fw={600} c="var(--mo-color-text)" className="mo-tabular-nums" ta="right" style={{ whiteSpace: "nowrap", flex: "0 0 auto", minWidth: 72 }}>
              {amountFormat === "currency" ? formatMoney(Math.round(item.amount)) : formatCount(item.amount)}
            </Text>
          ) : null}
        </li>
      ))}
    </Box>
  );
}
