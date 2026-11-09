"use client";

import { useState } from "react";
import { Box, Card, Group, ScrollArea, SegmentedControl, Skeleton, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconChartBar } from "@tabler/icons-react";
import { EmptyState } from "../EmptyState";
import type { AdminDailyRevenue } from "../../types/admin";
import { formatCount, formatMoney } from "./format";
import classes from "./RevenueChart.module.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** `2026-10-11` → `11 Oct` (calendar date, no timezone shift). */
function shortDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""}`;
}

function longDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[parsed.getUTCDay()] ?? ""}, ${shortDay(date)} ${date.slice(0, 4)}`;
}

/** Rounds the axis maximum up to 1, 2 or 5 × 10ⁿ. */
function niceCeiling(value: number): number {
  if (value <= 0) {
    return 0;
  }
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

/** Compact Taka for axis ticks (`৳1.2L`, `৳45K`). */
function compactTaka(value: number): string {
  if (value >= 10_000_000) {
    return `৳${Number((value / 10_000_000).toFixed(1))}Cr`;
  }
  if (value >= 100_000) {
    return `৳${Number((value / 100_000).toFixed(1))}L`;
  }
  if (value >= 1000) {
    return `৳${Number((value / 1000).toFixed(1))}K`;
  }
  return `৳${value}`;
}

export interface RevenueChartProps {
  data: AdminDailyRevenue[] | undefined;
  loading: boolean;
  /** Caption under the title, e.g. "Last 30 days". */
  periodLabel: string;
}

/**
 * Daily revenue as a single-series bar chart (brand pink, one hue), with a
 * per-bar tooltip and a table view that doubles as the accessible fallback.
 */
export function RevenueChart({ data, loading, periodLabel }: RevenueChartProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const days = data ?? [];
  const max = niceCeiling(Math.max(0, ...days.map((day) => day.revenue)));
  const total = days.reduce((sum, day) => sum + day.revenue, 0);
  const hasRevenue = total > 0;
  const middle = days.length > 2 ? days[Math.floor((days.length - 1) / 2)] : undefined;

  return (
    <Card withBorder padding="lg" h="100%">
      <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="sm">
        <Box>
          <Text fw={700} ff="var(--mo-font-heading)">
            Daily revenue
          </Text>
          <Text size="xs" c="dimmed">
            {periodLabel}
            {data ? ` · ${formatMoney(total)} total` : ""}
          </Text>
        </Box>
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(next) => setView(next === "table" ? "table" : "chart")}
          data={[
            { label: "Chart", value: "chart" },
            { label: "Table", value: "table" },
          ]}
          aria-label="Revenue view"
        />
      </Group>

      {loading && !data ? (
        <Stack gap="xs">
          <Skeleton height={200} radius="md" />
          <Skeleton height={12} width="40%" radius="xl" />
        </Stack>
      ) : null}

      {data && view === "chart" ? (
        hasRevenue ? (
          <Box>
            <Group align="stretch" gap="xs" wrap="nowrap">
              <Stack justify="space-between" h={200} py={0} aria-hidden>
                <span className={classes.axisLabel}>{compactTaka(max)}</span>
                <span className={classes.axisLabel}>{compactTaka(max / 2)}</span>
                <span className={classes.axisLabel}>৳0</span>
              </Stack>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <div
                  className={classes.plot}
                  role="img"
                  aria-label={`Daily revenue bar chart, ${periodLabel}. Total ${formatMoney(total)}. Switch to the table view for every value.`}
                >
                  <span className={classes.gridline} style={{ top: 0 }} />
                  <span className={classes.gridline} style={{ top: "50%" }} />
                  {days.map((day) => (
                    <Tooltip
                      key={day.date}
                      label={`${longDay(day.date)} — ${formatMoney(day.revenue)} · ${formatCount(day.orderCount)} ${day.orderCount === 1 ? "order" : "orders"}`}
                      withinPortal
                      openDelay={0}
                    >
                      <div className={classes.slot}>
                        <div className={classes.bar} style={{ transform: `scaleY(${max > 0 ? day.revenue / max : 0})` }} />
                      </div>
                    </Tooltip>
                  ))}
                </div>
                <Group justify="space-between" mt={6} aria-hidden wrap="nowrap">
                  <span className={classes.axisLabel}>{days[0] ? shortDay(days[0].date) : ""}</span>
                  <span className={classes.axisLabel}>{middle ? shortDay(middle.date) : ""}</span>
                  <span className={classes.axisLabel}>{days.length > 1 ? shortDay(days[days.length - 1]?.date ?? "") : ""}</span>
                </Group>
              </Box>
            </Group>
          </Box>
        ) : (
          <EmptyState
            withCard={false}
            size="sm"
            icon={<IconChartBar stroke={1.6} />}
            title="No revenue in this period"
            description="Revenue counts every order except cancelled and refunded ones, including delivery fees."
          />
        )
      ) : null}

      {data && view === "table" ? (
        <ScrollArea.Autosize mah={260} type="auto">
          <Table stickyHeader verticalSpacing={6} aria-label={`Daily revenue, ${periodLabel}`}>
            <Table.Thead bg="var(--mo-color-surface-muted)">
              <Table.Tr>
                <Table.Th scope="col">Date</Table.Th>
                <Table.Th scope="col" ta="right">
                  Revenue
                </Table.Th>
                <Table.Th scope="col" ta="right">
                  Orders
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody className="mo-tabular-nums">
              {days.map((day) => (
                <Table.Tr key={day.date}>
                  <Table.Td>{longDay(day.date)}</Table.Td>
                  <Table.Td ta="right">{formatMoney(day.revenue)}</Table.Td>
                  <Table.Td ta="right">{formatCount(day.orderCount)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      ) : null}
    </Card>
  );
}
