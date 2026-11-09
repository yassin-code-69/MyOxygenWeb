"use client";

import type { ReactNode } from "react";
import { ActionIcon, Group, Stack, Text, Tooltip, type MantineColor } from "@mantine/core";
import { IconChartArea, IconTable } from "@tabler/icons-react";
import type { TooltipContentProps } from "recharts";
import { formatCompactCount, formatCompactTaka, formatCount, formatMoney, formatPercent } from "../format";
import { cssColor } from "./tones";
import classes from "./kit.module.css";

/** How a chart value is printed. */
export type ChartValueFormat = "currency" | "count" | "percent";

/** Chart or accessible data-table view. */
export type ChartView = "chart" | "table";

/** Full value for tooltips and tables (`৳68,420`, `1,248`, `39.5%`). */
export function formatChartValue(value: number, format: ChartValueFormat): string {
  if (format === "currency") {
    return formatMoney(Math.round(value));
  }
  if (format === "percent") {
    return formatPercent(value);
  }
  return formatCount(value);
}

/** Compact value for axis ticks (`৳60K`, `1.2K`, `40%`). */
export function formatAxisValue(value: number, format: ChartValueFormat): string {
  if (format === "currency") {
    return formatCompactTaka(value);
  }
  if (format === "percent") {
    return `${Number(value.toFixed(0))}%`;
  }
  return formatCompactCount(value);
}

export interface ChartTooltipSeries {
  key: string;
  label: string;
  color: MantineColor;
  format: ChartValueFormat;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * Recharts `content` renderer: a white card with the bucket label and one row
 * per series, each formatted with its own unit (৳, count, %).
 */
export function renderChartTooltip(series: readonly ChartTooltipSeries[]) {
  return function ChartTooltipContent({ active, payload, label }: TooltipContentProps): ReactNode {
    if (!active || !payload || payload.length === 0) {
      return null;
    }
    const rows = series
      .map((item) => {
        const entry = payload.find((candidate) => String(candidate.dataKey) === item.key);
        const value = entry ? toNumber(entry.value) : null;
        return value === null ? null : { ...item, value };
      })
      .filter((row): row is ChartTooltipSeries & { value: number } => row !== null);
    if (rows.length === 0) {
      return null;
    }
    return (
      <div className={classes.tooltip}>
        <Text size="xs" fw={600} c="var(--mo-color-text)" mb={6}>
          {label}
        </Text>
        <Stack gap={4}>
          {rows.map((row) => (
            <Group key={row.key} justify="space-between" gap="md" wrap="nowrap">
              <Group gap={6} wrap="nowrap">
                <span className={classes.dot} style={{ backgroundColor: cssColor(row.color) }} aria-hidden />
                <Text size="xs" c="var(--mo-color-text-secondary)">
                  {row.label}
                </Text>
              </Group>
              <Text size="xs" fw={700} c="var(--mo-color-text)" className="mo-tabular-nums">
                {formatChartValue(row.value, row.format)}
              </Text>
            </Group>
          ))}
        </Stack>
      </div>
    );
  };
}

export interface ChartViewToggleProps {
  value: ChartView;
  onChange: (value: ChartView) => void;
  /** What the chart shows, for the accessible name ("sales"). */
  subject?: string;
}

/**
 * Icon toggle between the chart and its data table (place it in a
 * `SectionCard`'s `actions`). Charts also always render a visually hidden
 * table for screen readers.
 */
export function ChartViewToggle({ value, onChange, subject = "chart data" }: ChartViewToggleProps) {
  const showingTable = value === "table";
  const label = showingTable ? `Show ${subject} as a chart` : `Show ${subject} as a table`;
  return (
    <Tooltip label={showingTable ? "Show chart" : "Show table"}>
      <ActionIcon
        variant="default"
        size={32}
        radius="xl"
        aria-label={label}
        aria-pressed={showingTable}
        onClick={() => onChange(showingTable ? "chart" : "table")}
      >
        {showingTable ? <IconChartArea size={16} aria-hidden /> : <IconTable size={16} aria-hidden />}
      </ActionIcon>
    </Tooltip>
  );
}
