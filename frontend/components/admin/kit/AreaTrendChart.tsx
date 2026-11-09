"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AreaChart } from "@mantine/charts";
import { Box, ScrollArea, Skeleton, Table, VisuallyHidden, type MantineColor } from "@mantine/core";
import { IconChartAreaLine } from "@tabler/icons-react";
import { useCartesianScale, useIsTooltipActive, usePlotArea } from "recharts";
import { EmptyState } from "../../EmptyState";
import {
  formatAxisValue,
  formatChartValue,
  renderChartTooltip,
  type ChartValueFormat,
  type ChartView,
} from "./chart-utils";
import classes from "./kit.module.css";

export interface TrendPoint {
  /** X-axis label ("Sep 26", "Sep 2026"). Must be unique within the series. */
  label: string;
  value: number;
  /** Optional machine period (`YYYY-MM-DD` / `YYYY-MM`). */
  period?: string;
}

export interface AreaTrendChartProps {
  /** `undefined` while loading. */
  data: readonly TrendPoint[] | undefined;
  /** Series name for the tooltip, table header and accessible label ("Revenue"). */
  seriesLabel: string;
  /** Value formatting (axis is compacted: ৳60K). Default `currency`. */
  format?: Exclude<ChartValueFormat, "percent">;
  /** Theme color with shade. Default `secondaryGreen.6`. */
  color?: MantineColor;
  /** Point that gets the pill label: the last bucket (default), the peak, or none. */
  highlight?: "last" | "peak" | "none";
  /** Plot height in px. Default 260. */
  height?: number;
  loading?: boolean;
  /** Controlled view (pair with `ChartViewToggle`). Default `chart`. */
  view?: ChartView;
  /** Period wording for the accessible summary ("last 7 days"). */
  periodLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

const X_KEY = "label";
const Y_KEY = "value";

interface HighlightPillProps {
  label: string;
  value: number;
  text: string;
  container: HTMLDivElement | null;
}

/**
 * Pill label above a data point. Rendered as HTML (a portal into the chart's
 * overlay) at the pixel position Recharts computes, positioned with
 * `transform` only; it fades out while the hover tooltip is open.
 */
function HighlightPill({ label, value, text, container }: HighlightPillProps) {
  const coords = useCartesianScale({ x: label, y: value });
  const plot = usePlotArea();
  const tooltipActive = useIsTooltipActive();
  if (!container || !coords || !plot) {
    return null;
  }
  const nearRight = coords.x > plot.x + plot.width - 56;
  const nearLeft = coords.x < plot.x + 56;
  const shiftX = nearRight ? "-82%" : nearLeft ? "-18%" : "-50%";
  const arrowLeft = nearRight ? "82%" : nearLeft ? "18%" : "50%";
  return createPortal(
    <div
      className={classes.highlightPill}
      data-hidden={tooltipActive || undefined}
      style={
        {
          transform: `translate(${coords.x}px, ${coords.y}px) translate(${shiftX}, calc(-100% - 12px))`,
          "--pill-arrow-left": arrowLeft,
        } as CSSProperties
      }
      aria-hidden
    >
      {text}
    </div>,
    container,
  );
}

/**
 * Single-series area chart (green gradient fill) with ৳ axis formatting, a
 * pill label on the latest (or peak) point, a hover tooltip, and an
 * accessible data table (always present for screen readers; visible when
 * `view="table"`).
 *
 * ```tsx
 * const [view, setView] = useState<ChartView>("chart");
 * <SectionCard title="Sales Overview" actions={<ChartViewToggle value={view} onChange={setView} subject="sales" />}>
 *   <AreaTrendChart data={series?.map((p) => ({ label: p.label, value: p.revenue }))} seriesLabel="Revenue" view={view} />
 * </SectionCard>
 * ```
 */
export function AreaTrendChart({
  data,
  seriesLabel,
  format = "currency",
  color = "secondaryGreen.6",
  highlight = "last",
  height = 260,
  loading = false,
  view = "chart",
  periodLabel,
  emptyTitle,
  emptyDescription,
}: AreaTrendChartProps) {
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const rows = useMemo(() => (data ?? []).map((point) => ({ [X_KEY]: point.label, [Y_KEY]: point.value })), [data]);
  const tooltipContent = useMemo(
    () => renderChartTooltip([{ key: Y_KEY, label: seriesLabel, color, format }]),
    [seriesLabel, color, format],
  );

  if (loading && !data) {
    return <Skeleton height={height} radius="md" aria-label={`Loading ${seriesLabel.toLowerCase()} chart`} />;
  }

  const points = data ?? [];
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const hasValues = points.some((point) => point.value !== 0);

  if (!hasValues) {
    return (
      <Box h={height} display="flex" style={{ alignItems: "center", justifyContent: "center" }}>
        <EmptyState
          withCard={false}
          size="sm"
          icon={<IconChartAreaLine stroke={1.6} />}
          color="secondaryGreen"
          title={emptyTitle ?? `No ${seriesLabel.toLowerCase()} in this period`}
          description={emptyDescription}
        />
      </Box>
    );
  }

  let target: TrendPoint | undefined;
  if (highlight === "last") {
    target = points[points.length - 1];
  } else if (highlight === "peak") {
    target = points.reduce<TrendPoint | undefined>((best, point) => (!best || point.value > best.value ? point : best), undefined);
  }

  const summary = `${seriesLabel}${periodLabel ? `, ${periodLabel}` : ""}: ${formatChartValue(total, format)} in total across ${points.length} ${
    points.length === 1 ? "period" : "periods"
  }.`;

  const table = (
    <Table verticalSpacing={6} stickyHeader aria-label={`${seriesLabel}${periodLabel ? `, ${periodLabel}` : ""}`}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th scope="col">Period</Table.Th>
          <Table.Th scope="col" ta="right">
            {seriesLabel}
          </Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody className="mo-tabular-nums">
        {points.map((point) => (
          <Table.Tr key={point.period ?? point.label}>
            <Table.Td>{point.label}</Table.Td>
            <Table.Td ta="right">{formatChartValue(point.value, format)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  if (view === "table") {
    return (
      <ScrollArea h={height} type="auto" offsetScrollbars>
        {table}
      </ScrollArea>
    );
  }

  return (
    <>
      <div className={classes.chartFrame} style={{ height }}>
        <AreaChart
          h={height}
          data={rows}
          dataKey={X_KEY}
          series={[{ name: Y_KEY, label: seriesLabel, color }]}
          curveType="linear"
          withGradient
          fillOpacity={0.35}
          strokeWidth={2.5}
          gridAxis="x"
          strokeDasharray="4 4"
          gridColor="gray.2"
          textColor="gray.6"
          tickLine="none"
          withDots
          dotProps={{ r: 4, strokeWidth: 2, fill: "var(--mo-color-surface)", stroke: "var(--mantine-color-secondaryGreen-6)" }}
          activeDotProps={{ r: 6, strokeWidth: 3, fill: "var(--mantine-color-secondaryGreen-7)", stroke: "var(--mo-color-surface)" }}
          valueFormatter={(value) => formatChartValue(value, format)}
          yAxisProps={{ width: 56, tickFormatter: (value: number) => formatAxisValue(value, format), domain: [0, "auto"] }}
          xAxisProps={{ padding: { left: 12, right: 24 }, minTickGap: 12 }}
          areaChartProps={{ margin: { top: 40, right: 8, bottom: 0, left: 0 } }}
          tooltipProps={{ content: tooltipContent, position: undefined, offset: 16 }}
          referenceDots={
            target
              ? [{ x: target.label, y: target.value, r: 6, color: "secondaryGreen.7", strokeWidth: 3, stroke: "var(--mo-color-surface)" }]
              : undefined
          }
          accessibilityLayer={false}
          role="img"
          aria-label={summary}
        >
          {target ? (
            <HighlightPill label={target.label} value={target.value} text={formatChartValue(target.value, format)} container={overlay} />
          ) : null}
        </AreaChart>
        <div ref={setOverlay} className={classes.chartOverlay} />
      </div>
      <VisuallyHidden>{table}</VisuallyHidden>
    </>
  );
}
