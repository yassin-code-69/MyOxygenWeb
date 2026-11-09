"use client";

import { useState } from "react";
import type { AdminDailyRevenue } from "../../types/admin";
import { formatMoney } from "./format";
import { AreaTrendChart } from "./kit/AreaTrendChart";
import { ChartViewToggle, type ChartView } from "./kit/chart-utils";
import { SectionCard } from "./kit/SectionCard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-10-11` → `Oct 11` (calendar date, no timezone shift). */
function shortDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${MONTHS[Number(month) - 1] ?? ""} ${Number(day)}`;
}

export interface RevenueChartProps {
  data: AdminDailyRevenue[] | undefined;
  loading: boolean;
  /** Caption under the title, e.g. "Last 30 days". */
  periodLabel: string;
}

/**
 * Daily revenue card (legacy props, v1 `dailyRevenue`) rendered with the kit's
 * green area chart and its accessible table view.
 */
export function RevenueChart({ data, loading, periodLabel }: RevenueChartProps) {
  const [view, setView] = useState<ChartView>("chart");
  const total = (data ?? []).reduce((sum, day) => sum + day.revenue, 0);
  return (
    <SectionCard
      title="Daily revenue"
      subtitle={data ? `${periodLabel} · ${formatMoney(total)} total` : periodLabel}
      actions={<ChartViewToggle value={view} onChange={setView} subject="daily revenue" />}
    >
      <AreaTrendChart
        data={data?.map((day) => ({ label: shortDay(day.date), period: day.date, value: day.revenue }))}
        loading={loading}
        seriesLabel="Revenue"
        format="currency"
        view={view}
        periodLabel={periodLabel.toLowerCase()}
        emptyDescription="Revenue counts every order except cancelled and refunded ones, including delivery fees."
      />
    </SectionCard>
  );
}
