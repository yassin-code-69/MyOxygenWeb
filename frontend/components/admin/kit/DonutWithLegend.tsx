"use client";

import Link from "next/link";
import { DonutChart } from "@mantine/charts";
import { Box, Group, Skeleton, Stack, Text, VisuallyHidden, type MantineColor } from "@mantine/core";
import { IconChartDonut } from "@tabler/icons-react";
import { EmptyState } from "../../EmptyState";
import { formatChartValue, type ChartValueFormat } from "./chart-utils";
import { cssColor } from "./tones";
import { formatPercent } from "../format";
import classes from "./kit.module.css";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  /** Theme color with shade, e.g. `warning.6`. */
  color: MantineColor;
  /** Makes the legend row a link (e.g. `/admin/orders?status=PENDING`). */
  href?: string;
}

export interface DonutWithLegendProps {
  /** `undefined` while loading. Zero segments stay in the legend but not in the ring. */
  data: readonly DonutSegment[] | undefined;
  /** Caption under the centre total ("Total Orders"). */
  totalLabel: string;
  /** Centre number; defaults to the sum of the segments. */
  total?: number;
  /** Value formatting. Default `count`. */
  format?: Exclude<ChartValueFormat, "percent">;
  /** Ring diameter in px. Default 176. */
  size?: number;
  /** Ring thickness in px. Default 26. */
  thickness?: number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * Donut with a centred total and a legend of `label · count (percent)` rows
 * (mockup "Orders by Status"). The legend doubles as the accessible readout.
 *
 * ```tsx
 * <DonutWithLegend totalLabel="Total Orders" data={ADMIN_ORDER_STATUSES.map((s) => ({
 *   key: s, label: STATUS_CONFIG[s].label, value: data.ordersByStatus[s], color: `${STATUS_CONFIG[s].color}.6` }))} />
 * ```
 */
export function DonutWithLegend({
  data,
  totalLabel,
  total,
  format = "count",
  size = 176,
  thickness = 26,
  loading = false,
  emptyTitle = "Nothing to chart yet",
  emptyDescription,
}: DonutWithLegendProps) {
  if (loading && !data) {
    return (
      <Group gap="lg" wrap="wrap" justify="center" align="center" aria-hidden>
        <Skeleton circle height={size} />
        <Stack gap={14} style={{ flex: "1 1 150px" }}>
          {Array.from({ length: 5 }, (_, index) => (
            <Group key={index} justify="space-between" wrap="nowrap" h={20}>
              <Skeleton height={12} width={110} radius="xl" />
              <Skeleton height={12} width={64} radius="xl" />
            </Group>
          ))}
        </Stack>
      </Group>
    );
  }

  const segments = data ?? [];
  const sum = segments.reduce((acc, segment) => acc + Math.max(0, segment.value), 0);
  const centre = total ?? sum;

  if (sum <= 0) {
    return (
      <Box mih={size} display="flex" style={{ alignItems: "center", justifyContent: "center" }}>
        <EmptyState withCard={false} size="sm" icon={<IconChartDonut stroke={1.6} />} color="secondaryGreen" title={emptyTitle} description={emptyDescription} />
      </Box>
    );
  }

  const ring = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => ({ name: segment.label, value: segment.value, color: segment.color }));

  return (
    <Group gap="lg" wrap="wrap" justify="center" align="center">
      <Box pos="relative" w={size} h={size} style={{ flex: "0 0 auto" }}>
        <DonutChart
          data={ring}
          size={size}
          thickness={thickness}
          paddingAngle={2}
          strokeWidth={0}
          withTooltip
          tooltipDataSource="segment"
          pieProps={{ isAnimationActive: false }}
          valueFormatter={(value) => formatChartValue(value, format)}
          aria-hidden
        />
        <div className={classes.donutCenter} aria-hidden>
          <Text fz={26} fw={700} lh={1.1} ff="var(--mo-font-heading)" c="var(--mo-color-text)" className="mo-tabular-nums">
            {formatChartValue(centre, format)}
          </Text>
          <Text size="xs" c="var(--mo-color-text-muted)" mt={2}>
            {totalLabel}
          </Text>
        </div>
      </Box>

      <Stack component="ul" gap={10} m={0} p={0} style={{ flex: "1 1 150px", listStyle: "none", minWidth: 0 }}>
        <VisuallyHidden component="li">
          {totalLabel}: {formatChartValue(centre, format)}
        </VisuallyHidden>
        {segments.map((segment) => {
          const percent = sum > 0 ? (segment.value / sum) * 100 : 0;
          const row = (
            <Group justify="space-between" wrap="nowrap" gap="sm" mih={22}>
              <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
                <span className={classes.dot} style={{ backgroundColor: cssColor(segment.color) }} aria-hidden />
                <Text size="sm" c="var(--mo-color-text-strong)" truncate>
                  {segment.label}
                </Text>
              </Group>
              <Text size="sm" c="var(--mo-color-text-secondary)" className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
                {formatChartValue(segment.value, format)}{" "}
                <Text component="span" size="sm" c="var(--mo-color-text-muted)">
                  ({formatPercent(percent, 0)})
                </Text>
              </Text>
            </Group>
          );
          return (
            <li key={segment.key}>
              {segment.href ? (
                <Link href={segment.href} className={classes.cellLink} style={{ display: "block" }}>
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </Stack>
    </Group>
  );
}
