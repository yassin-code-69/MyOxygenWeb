"use client";

import { useMemo } from "react";
import { BarChart } from "@mantine/charts";
import { Box, ScrollArea, Skeleton, Table, VisuallyHidden } from "@mantine/core";
import { IconUserPlus } from "@tabler/icons-react";
import { EmptyState } from "../../../EmptyState";
import type { CustomerSignupPoint } from "../../../../types/admin-reports";
import { formatCount } from "../../format";
import { renderChartTooltip, type ChartView } from "../../kit";

export interface SignupChartProps {
  points: readonly CustomerSignupPoint[] | undefined;
  view: ChartView;
  periodLabel: string;
  height?: number;
}

const SERIES = [{ key: "count", label: "Sign-ups", color: "accentPurple.6", format: "count" as const }];

/**
 * Sign-ups per day / month as bars. Composed locally because the kit's
 * AreaTrendChart can't force whole-number ticks: small counts (0–2 a day)
 * would show duplicated "1, 1, 2, 2" axis labels.
 */
export function SignupChart({ points, view, periodLabel, height = 280 }: SignupChartProps) {
  const data = useMemo(() => (points ?? []).map((point) => ({ label: point.label, count: point.count })), [points]);
  const tooltip = useMemo(() => renderChartTooltip(SERIES), []);

  if (!points) {
    return <Skeleton height={height} radius="md" aria-label="Loading sign-ups chart" />;
  }
  const total = points.reduce((sum, point) => sum + point.count, 0);
  if (total === 0) {
    return (
      <Box h={height} display="flex" style={{ alignItems: "center", justifyContent: "center" }}>
        <EmptyState withCard={false} size="sm" color="secondaryGreen" icon={<IconUserPlus stroke={1.6} />} title="No sign-ups in this period" description="New customer accounts appear here." />
      </Box>
    );
  }

  const table = (
    <Table verticalSpacing={6} stickyHeader aria-label={`Sign-ups, ${periodLabel}`}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th scope="col">Period</Table.Th>
          <Table.Th scope="col" ta="right">
            Sign-ups
          </Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody className="mo-tabular-nums">
        {points.map((point) => (
          <Table.Tr key={point.period}>
            <Table.Td>{point.label}</Table.Td>
            <Table.Td ta="right">{formatCount(point.count)}</Table.Td>
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
      <BarChart
        h={height}
        data={data}
        dataKey="label"
        series={[{ name: "count", label: "Sign-ups", color: "accentPurple.6" }]}
        gridAxis="y"
        strokeDasharray="4 4"
        tickLine="none"
        maxBarWidth={18}
        barProps={{ radius: [4, 4, 0, 0], isAnimationActive: false }}
        valueFormatter={(value) => formatCount(value)}
        yAxisProps={{ allowDecimals: false, width: 32 }}
        xAxisProps={{ minTickGap: 12 }}
        tooltipProps={{ content: tooltip, position: undefined, offset: 16 }}
        accessibilityLayer={false}
        role="img"
        aria-label={`Sign-ups, ${periodLabel}: ${formatCount(total)} in total`}
      />
      <VisuallyHidden>{table}</VisuallyHidden>
    </>
  );
}
