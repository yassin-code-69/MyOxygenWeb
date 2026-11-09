"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Box, Group, Skeleton, Text, type MantineColor } from "@mantine/core";
import { IconChartBar } from "@tabler/icons-react";
import { EmptyState } from "../../EmptyState";
import { MeterBar } from "../MeterBar";
import { formatPercent } from "../format";
import { paletteColor } from "./tones";
import classes from "./kit.module.css";

export interface ProgressItem {
  key: string;
  label: string;
  /** 0–100. */
  percent: number;
  /** Theme color (with or without shade). Defaults to the categorical palette. */
  color?: MantineColor;
  /** Right-hand text; defaults to the percent. */
  value?: ReactNode;
  /** Makes the label a link. */
  href?: string;
}

export interface ProgressListProps {
  /** `undefined` while loading. */
  items: readonly ProgressItem[] | undefined;
  loading?: boolean;
  /** Skeleton rows while loading. Default 5. */
  skeletonCount?: number;
  /** Width of the label column in px. Default 108. */
  labelWidth?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * Label + colored bar + percent rows (mockup "Top Categories"). Bars scale
 * with `transform` (MeterBar), never by animating width.
 *
 * ```tsx
 * <ProgressList items={sales.map((c) => ({ key: c.categoryId, label: c.name, percent: c.sharePercent }))} />
 * ```
 */
export function ProgressList({
  items,
  loading = false,
  skeletonCount = 5,
  labelWidth = 108,
  emptyTitle = "Nothing to show yet",
  emptyDescription,
}: ProgressListProps) {
  if (loading && !items) {
    return (
      <Box aria-hidden>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <Group key={index} gap="sm" wrap="nowrap" h={34}>
            <Skeleton height={10} width={labelWidth - 24} radius="xl" />
            <Skeleton height={8} radius="xl" style={{ flex: 1 }} />
            <Skeleton height={10} width={28} radius="xl" />
          </Group>
        ))}
      </Box>
    );
  }
  if (!items || items.length === 0) {
    return <EmptyState withCard={false} size="sm" icon={<IconChartBar stroke={1.6} />} color="secondaryGreen" title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <Box component="ul" className={classes.list}>
      {items.map((item, index) => {
        const color = item.color ?? paletteColor(index);
        return (
          <Group component="li" key={item.key} gap="sm" wrap="nowrap" mih={34}>
            <Box w={labelWidth} style={{ flex: `0 0 ${labelWidth}px`, minWidth: 0 }}>
              {item.href ? (
                <Text component={Link} href={item.href} size="sm" truncate className={classes.cellLink}>
                  {item.label}
                </Text>
              ) : (
                <Text size="sm" c="var(--mo-color-text-strong)" truncate>
                  {item.label}
                </Text>
              )}
            </Box>
            <Box style={{ flex: "1 1 auto", minWidth: 40 }}>
              <MeterBar ratio={item.percent / 100} color={color} height={8} />
            </Box>
            <Text size="sm" fw={600} c="var(--mo-color-text)" className="mo-tabular-nums" ta="right" style={{ flex: "0 0 auto", minWidth: 36 }}>
              {item.value ?? formatPercent(item.percent, 0)}
            </Text>
          </Group>
        );
      })}
    </Box>
  );
}
