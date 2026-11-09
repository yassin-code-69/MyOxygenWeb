"use client";

import { useMemo } from "react";
import { CompositeChart, type CompositeChartSeries } from "@mantine/charts";
import { Box, ScrollArea, Skeleton, Table, VisuallyHidden, type MantineColor } from "@mantine/core";
import { IconChartHistogram } from "@tabler/icons-react";
import { EmptyState } from "../../EmptyState";
import {
  formatAxisValue,
  formatChartValue,
  renderChartTooltip,
  type ChartTooltipSeries,
  type ChartValueFormat,
  type ChartView,
} from "./chart-utils";

/**
 * One bucket: its label plus a number per series key. `null` means "no value"
 * (e.g. margin on a day without sales): the line shows a gap and the table "—".
 */
export type ComboDatum = { label: string } & Record<string, number | string | null>;

export interface ComboSeries {
  /** Key in each `ComboDatum`. */
  key: string;
  label: string;
  /** Theme color with shade (`secondaryGreen.6`). */
  color: MantineColor;
}

export interface ComboLineSeries extends ComboSeries {
  /** Line values format (right axis). Default `percent`. */
  format?: ChartValueFormat;
}

export interface ComboTrendChartProps {
  /** `undefined` while loading. */
  data: readonly ComboDatum[] | undefined;
  /** Bar series on the left axis (e.g. revenue, cost, profit). */
  bars: readonly ComboSeries[];
  /** Optional line on the right axis (e.g. margin %). */
  line?: ComboLineSeries;
  /** Bar values format. Default `currency`. */
  barFormat?: Exclude<ChartValueFormat, "percent">;
  /** Plot height in px. Default 300. */
  height?: number;
  loading?: boolean;
  /** Controlled view (pair with `ChartViewToggle`). Default `chart`. */
  view?: ChartView;
  withLegend?: boolean;
  /** Accessible title ("Profit and margin trend"). */
  ariaLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

function numberAt(datum: ComboDatum, key: string): number {
  const value = datum[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Bars (৳ on the left axis) plus an optional line on a right axis (margin %)
 * — the profit & margin trend from mockup 3. Uses token colors, a per-series
 * formatted tooltip and an accessible data table.
 *
 * ```tsx
 * <ComboTrendChart data={trend} bars={[
 *   { key: "revenue", label: "Revenue", color: "secondaryGreen.6" },
 *   { key: "cost", label: "Cost", color: "primaryPink.4" },
 *   { key: "profit", label: "Profit", color: "info.5" },
 * ]} line={{ key: "marginPercent", label: "Margin %", color: "warning.6" }} />
 * ```
 */
export function ComboTrendChart({
  data,
  bars,
  line,
  barFormat = "currency",
  height = 300,
  loading = false,
  view = "chart",
  withLegend = true,
  ariaLabel = "Trend chart",
  emptyTitle = "No data in this period",
  emptyDescription,
}: ComboTrendChartProps) {
  const lineFormat = line?.format ?? "percent";
  const tooltipSeries = useMemo<ChartTooltipSeries[]>(
    () => [
      ...bars.map((bar) => ({ key: bar.key, label: bar.label, color: bar.color, format: barFormat })),
      ...(line ? [{ key: line.key, label: line.label, color: line.color, format: lineFormat }] : []),
    ],
    [bars, line, barFormat, lineFormat],
  );
  const tooltipContent = useMemo(() => renderChartTooltip(tooltipSeries), [tooltipSeries]);

  if (loading && !data) {
    return <Skeleton height={height} radius="md" aria-label="Loading chart" />;
  }

  const rows = data ?? [];
  const hasValues = rows.some((row) => tooltipSeries.some((series) => numberAt(row, series.key) !== 0));
  if (!hasValues) {
    return (
      <Box h={height} display="flex" style={{ alignItems: "center", justifyContent: "center" }}>
        <EmptyState withCard={false} size="sm" icon={<IconChartHistogram stroke={1.6} />} color="secondaryGreen" title={emptyTitle} description={emptyDescription} />
      </Box>
    );
  }

  const series: CompositeChartSeries[] = [
    ...bars.map((bar) => ({ name: bar.key, label: bar.label, color: bar.color, type: "bar" as const })),
    ...(line ? [{ name: line.key, label: line.label, color: line.color, type: "line" as const, yAxisId: "right" }] : []),
  ];

  const table = (
    <Table verticalSpacing={6} stickyHeader aria-label={ariaLabel}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th scope="col">Period</Table.Th>
          {tooltipSeries.map((item) => (
            <Table.Th key={item.key} scope="col" ta="right">
              {item.label}
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody className="mo-tabular-nums">
        {rows.map((row) => (
          <Table.Tr key={row.label}>
            <Table.Td>{row.label}</Table.Td>
            {tooltipSeries.map((item) => (
              <Table.Td key={item.key} ta="right">
                {row[item.key] === null ? "—" : formatChartValue(numberAt(row, item.key), item.format)}
              </Table.Td>
            ))}
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
      <CompositeChart
        h={height}
        data={rows.map((row) => ({ ...row }))}
        dataKey="label"
        series={series}
        curveType="monotone"
        withLegend={withLegend}
        legendProps={{ verticalAlign: "top", height: 36 }}
        gridAxis="x"
        strokeDasharray="4 4"
        // CompositeChart forwards gridColor/textColor props to the DOM (React
        // warns), so the same colours are set through Mantine's chart CSS vars.
        style={{ "--chart-grid-color": "var(--mantine-color-gray-2)", "--chart-text-color": "var(--mantine-color-gray-6)" }}
        tickLine="none"
        maxBarWidth={18}
        withDots
        dotProps={{ r: 3, strokeWidth: 2, fill: "var(--mo-color-surface)" }}
        valueFormatter={(value) => formatChartValue(value, barFormat)}
        yAxisProps={{ width: 60, tickFormatter: (value: number) => formatAxisValue(value, barFormat) }}
        withRightYAxis={Boolean(line)}
        rightYAxisProps={{ width: 48, tickFormatter: (value: number) => formatAxisValue(value, lineFormat) }}
        tooltipProps={{ content: tooltipContent, position: undefined, offset: 16 }}
        composedChartProps={{ barGap: 2, barCategoryGap: "22%" }}
        barProps={{ isAnimationActive: false }}
        lineProps={{ isAnimationActive: false }}
        accessibilityLayer={false}
        role="img"
        aria-label={ariaLabel}
      />
      <VisuallyHidden>{table}</VisuallyHidden>
    </>
  );
}
