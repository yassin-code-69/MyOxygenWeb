"use client";

import { useState } from "react";
import { Box, Group, Skeleton, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import {
  IconBuildingWarehouse,
  IconCash,
  IconCategory,
  IconChartPie,
  IconCoins,
  IconDiscount,
  IconFileExport,
  IconPercentage,
  IconPigMoney,
  IconPlus,
  IconReceipt2,
  IconReceiptTax,
  IconShoppingCart,
  IconTrophy,
} from "@tabler/icons-react";
import { PERMISSIONS } from "../../../../types/auth";
import type { ProfitCategoryRow, ProfitSummary, ProfitTopProduct, ProfitTrendPoint } from "../../../../types/admin-reports";
import type { AdminDateRange, AdminKpi } from "../../../../types/admin-dashboard";
import {
  ChartViewToggle,
  ComboTrendChart,
  DonutWithLegend,
  SectionCard,
  Thumb,
  formatRangeDates,
  paletteColor,
  previousPeriodCaption,
  type ChartView,
  type ComboDatum,
} from "../../kit";
import { formatPercent } from "../../format";
import { expenseSliceColor } from "../../expenses/expense-meta";
import { ActionTiles } from "../ActionTiles";
import { MarginPill } from "../MarginPill";
import { formatTaka } from "../report-utils";
import { ReportKpiGrid } from "../ReportKpiGrid";
import { ReportTable, type ReportColumn } from "../ReportTable";
import { SeriesLegend } from "../SeriesLegend";
import classes from "../reports.module.css";

interface SummaryProps {
  summary: ProfitSummary | undefined;
}

const PROFIT_BARS = [
  { key: "revenue", label: "Revenue", color: "secondaryGreen.6" },
  { key: "cost", label: "Cost", color: "primaryPink.4" },
  { key: "profit", label: "Profit", color: "info.5" },
] as const;

const MARGIN_LINE = { key: "marginPercent", label: "Margin %", color: "warning.6", format: "percent" } as const;

const PROFIT_LEGEND = [...PROFIT_BARS, MARGIN_LINE];

/** Margin KPIs change relatively ("▲ 3.1% from 31.6%"), so the caption names the previous value. */
function marginCaption(kpi: AdminKpi | undefined, fallback: string): string {
  return kpi ? `from ${formatPercent(kpi.previous)}` : fallback;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export function ProfitKpis({ summary, range }: SummaryProps & { range: AdminDateRange }) {
  const caption = previousPeriodCaption(range);
  const kpis = summary?.kpis;
  const loading = !summary;
  const noHistory = "No sales in the previous period";
  return (
    <ReportKpiGrid
      items={[
        { key: "revenue", tone: "mint", icon: <IconCash size={24} stroke={1.8} />, label: "Total Revenue", kpi: kpis?.revenue, format: "currency", trendCaption: caption, hint: noHistory, loading },
        {
          key: "cogs",
          tone: "lavender",
          icon: <IconReceipt2 size={24} stroke={1.8} />,
          label: "Total Cost (COGS)",
          kpi: kpis?.cogs,
          format: "currency",
          trendCaption: caption,
          invertTrend: true,
          hint: noHistory,
          loading,
        },
        { key: "gross", tone: "mint", icon: <IconCoins size={24} stroke={1.8} />, label: "Gross Profit", kpi: kpis?.grossProfit, format: "currency", trendCaption: caption, hint: noHistory, loading },
        {
          key: "gross-margin",
          tone: "sky",
          icon: <IconPercentage size={24} stroke={1.8} />,
          label: "Gross Margin",
          kpi: kpis?.grossMarginPercent,
          format: "percent",
          trendCaption: marginCaption(kpis?.grossMarginPercent, caption),
          hint: "Gross profit ÷ revenue",
          loading,
        },
        { key: "net", tone: "peach", icon: <IconPigMoney size={24} stroke={1.8} />, label: "Net Profit", kpi: kpis?.netProfit, format: "currency", trendCaption: caption, hint: "After operating expenses", loading },
        {
          key: "net-margin",
          tone: "rose",
          icon: <IconChartPie size={24} stroke={1.8} />,
          label: "Net Profit Margin",
          kpi: kpis?.netMarginPercent,
          format: "percent",
          trendCaption: marginCaption(kpis?.netMarginPercent, caption),
          hint: "Net profit ÷ revenue",
          loading,
        },
      ]}
    />
  );
}

/** Revenue, COGS, operating expenses and net profit (Sales vs Cost tab). */
export function CostKpis({ summary, range }: SummaryProps & { range: AdminDateRange }) {
  const caption = previousPeriodCaption(range);
  const kpis = summary?.kpis;
  const loading = !summary;
  return (
    <ReportKpiGrid
      items={[
        { key: "revenue", tone: "mint", icon: <IconCash size={24} stroke={1.8} />, label: "Revenue", kpi: kpis?.revenue, format: "currency", trendCaption: caption, loading },
        { key: "cogs", tone: "lavender", icon: <IconReceipt2 size={24} stroke={1.8} />, label: "Cost of Goods", kpi: kpis?.cogs, format: "currency", trendCaption: caption, invertTrend: true, loading },
        {
          key: "expenses",
          tone: "rose",
          icon: <IconReceiptTax size={24} stroke={1.8} />,
          label: "Operating Expenses",
          kpi: kpis?.expenses,
          format: "currency",
          trendCaption: caption,
          invertTrend: true,
          hint: "Recorded on the Expenses page",
          loading,
        },
        { key: "net", tone: "peach", icon: <IconPigMoney size={24} stroke={1.8} />, label: "Net Profit", kpi: kpis?.netProfit, format: "currency", trendCaption: caption, loading },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

function trendData(points: readonly ProfitTrendPoint[] | undefined): ComboDatum[] | undefined {
  return points?.map((point) => ({
    label: point.label,
    revenue: point.revenue,
    cost: point.cost,
    profit: point.profit,
    // A period without revenue has no margin (the API reports 0): leave a gap
    // instead of drawing the line down to 0%.
    marginPercent: point.revenue === 0 ? null : point.marginPercent,
  }));
}

export function ProfitTrendCard({ summary, range, height = 300 }: SummaryProps & { range: AdminDateRange; height?: number }) {
  const [view, setView] = useState<ChartView>("chart");
  const granularity = summary?.range.granularity === "month" ? "Monthly" : "Daily";
  return (
    <SectionCard
      title="Profit & Margin Trend"
      subtitle={`Revenue, cost, profit and margin · ${granularity} · ${formatRangeDates(range)}`}
      actions={<ChartViewToggle value={view} onChange={setView} subject="profit trend" />}
    >
      {view === "chart" && summary?.trend.some((point) => point.revenue !== 0 || point.cost !== 0) ? <SeriesLegend items={PROFIT_LEGEND} /> : null}
      <ComboTrendChart
        data={trendData(summary?.trend)}
        loading={!summary}
        bars={PROFIT_BARS}
        line={MARGIN_LINE}
        withLegend={false}
        height={height}
        view={view}
        ariaLabel={`Profit and margin trend, ${formatRangeDates(range)}`}
        emptyTitle="No sales in this period"
        emptyDescription="Revenue, cost and profit appear once orders come in."
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// By category
// ---------------------------------------------------------------------------

function categoryColumns(full: boolean): ReportColumn<ProfitCategoryRow>[] {
  const money = (key: "revenue" | "cost" | "profit", header: string): ReportColumn<ProfitCategoryRow> => ({
    key,
    header,
    align: "right",
    minWidth: 88,
    cell: (row) => (
      <Text size="sm" fw={key === "profit" ? 600 : 500} className={classes.num} c={key === "profit" && row.profit < 0 ? "var(--mo-color-danger-8)" : undefined}>
        {formatTaka(row[key])}
      </Text>
    ),
    skeletonWidth: 56,
  });
  return [
    {
      key: "category",
      header: "Category",
      minWidth: 160,
      cell: (row, index) => (
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={30} radius="xl" variant="light" color={paletteColor(index).split(".")[0]} aria-hidden style={{ flex: "0 0 auto" }}>
            <IconCategory size={16} />
          </ThemeIcon>
          <Text size="sm" fw={600} lineClamp={1}>
            {row.name}
          </Text>
        </Group>
      ),
      skeleton: (
        <Group gap="sm" wrap="nowrap">
          <Skeleton circle height={30} />
          <Skeleton height={11} radius="xl" style={{ flex: 1 }} />
        </Group>
      ),
    },
    money("revenue", "Revenue"),
    money("cost", full ? "Cost (COGS)" : "Cost"),
    money("profit", full ? "Gross profit" : "Profit"),
    {
      key: "margin",
      header: "Margin",
      align: "center",
      minWidth: 84,
      cell: (row) => <MarginPill percent={row.marginPercent} size="sm" />,
      skeletonWidth: 52,
    },
  ];
}

export function CategoryProfitCard({
  summary,
  error,
  onRetry,
  viewAllHref,
  full = false,
}: SummaryProps & { error?: unknown; onRetry?: () => void; viewAllHref?: string; full?: boolean }) {
  return (
    <SectionCard title="Profit & Margin by Category" subtitle={full ? "Product revenue and cost of goods per category" : undefined} viewAllHref={viewAllHref} flush>
      <ReportTable
        columns={categoryColumns(full)}
        rows={summary?.byCategory}
        getRowKey={(row) => row.categoryId}
        label="Profit and margin by category"
        loading={!summary}
        error={error}
        onRetry={onRetry}
        skeletonRows={5}
        minWidth={full ? 640 : 480}
        dense={!full}
        emptyTitle="No category sales in this period"
        emptyDescription="Category margins appear once orders come in."
        emptyIcon={<IconCategory stroke={1.6} />}
      />
    </SectionCard>
  );
}

export function CategoryChartCard({ summary, range }: SummaryProps & { range: AdminDateRange }) {
  const [view, setView] = useState<ChartView>("chart");
  const data = summary?.byCategory.map((row) => ({
    label: row.name,
    revenue: row.revenue,
    cost: row.cost,
    profit: row.profit,
    marginPercent: row.marginPercent,
  }));
  return (
    <SectionCard
      title="Category Profitability"
      subtitle={`Revenue, cost and profit per category · ${formatRangeDates(range)}`}
      actions={<ChartViewToggle value={view} onChange={setView} subject="category profitability" />}
    >
      {view === "chart" && summary && summary.byCategory.length > 0 ? <SeriesLegend items={PROFIT_LEGEND} /> : null}
      <ComboTrendChart
        data={data}
        loading={!summary}
        bars={PROFIT_BARS}
        line={MARGIN_LINE}
        withLegend={false}
        height={320}
        view={view}
        ariaLabel={`Profit by category, ${formatRangeDates(range)}`}
        emptyTitle="No category sales in this period"
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Top 5 profitable
// ---------------------------------------------------------------------------

export function TopProfitableCard({ summary, onSelect, viewAllHref }: SummaryProps & { onSelect: (productId: string) => void; viewAllHref?: string }) {
  const columns: ReportColumn<ProfitTopProduct>[] = [
    {
      key: "rank",
      header: "#",
      width: 32,
      cell: (_row, index) => (
        <Text size="sm" c="var(--mo-color-text-secondary)" className="mo-tabular-nums">
          {index + 1}
        </Text>
      ),
      skeletonWidth: 10,
    },
    {
      key: "product",
      header: "Product",
      cell: (row) => (
        <Group gap="sm" wrap="nowrap">
          <Thumb src={row.image} size={32} />
          <UnstyledButton className={classes.selectTitle} onClick={() => onSelect(row.productId)} aria-label={`Show profitability of ${row.title}`}>
            <Text span inherit lineClamp={1}>
              {row.title}
            </Text>
          </UnstyledButton>
        </Group>
      ),
      skeleton: (
        <Group gap="sm" wrap="nowrap">
          <Skeleton height={32} width={32} radius="sm" />
          <Skeleton height={11} radius="xl" style={{ flex: 1 }} />
        </Group>
      ),
    },
    { key: "margin", header: "Margin", align: "center", minWidth: 72, cell: (row) => <MarginPill percent={row.marginPercent} size="sm" />, skeletonWidth: 48 },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      cell: (row) => (
        <Text size="sm" fw={600} className={classes.num}>
          {formatTaka(row.profit)}
        </Text>
      ),
      skeletonWidth: 56,
    },
  ];
  return (
    <SectionCard title="Top 5 Profitable Products" viewAllHref={viewAllHref} flush>
      <ReportTable
        columns={columns}
        rows={summary?.topProfitable}
        getRowKey={(row) => row.productId}
        label="Top 5 profitable products"
        loading={!summary}
        skeletonRows={5}
        minWidth={340}
        dense
        emptyTitle="No profitable sales yet"
        emptyDescription="Your best earners appear once orders come in."
        emptyIcon={<IconTrophy stroke={1.6} />}
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Expense breakdown
// ---------------------------------------------------------------------------

export function ExpenseBreakdownCard({ summary, viewAllHref }: SummaryProps & { viewAllHref?: string }) {
  const segments = summary?.expenseBreakdown.map((slice) => ({
    key: slice.key,
    label: slice.label,
    value: slice.amount,
    color: expenseSliceColor(slice.key),
  }));
  return (
    <SectionCard title="Expense Breakdown" subtitle="Cost of goods plus operating expenses" viewAllHref={viewAllHref} viewAllLabel="Expenses">
      <Box py={4}>
        <DonutWithLegend
          data={segments}
          loading={!summary}
          totalLabel="Total Cost"
          format="currency"
          size={150}
          thickness={20}
          emptyTitle="No costs in this period"
          emptyDescription="Product cost and expenses appear here."
        />
      </Box>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

export function ProfitActionsCard({ exporting, onExport }: { exporting: boolean; onExport: () => void }) {
  return (
    <SectionCard title="Quick Actions">
      <ActionTiles
        cols={2}
        actions={[
          { key: "add-product", label: "Add Product", href: "/admin/products?new=1", icon: <IconPlus size={18} stroke={2} />, tone: "mint", permission: PERMISSIONS.PRODUCTS_WRITE },
          { key: "add-coupon", label: "Add Coupon", href: "/admin/discounts?new=coupon", icon: <IconDiscount size={18} stroke={2} />, tone: "rose", permission: PERMISSIONS.DISCOUNTS_MANAGE },
          { key: "orders", label: "View Orders", href: "/admin/orders", icon: <IconShoppingCart size={18} stroke={2} />, tone: "sky", permission: PERMISSIONS.ORDERS_READ },
          { key: "export", label: exporting ? "Generating…" : "Generate Report", onClick: onExport, busy: exporting, icon: <IconFileExport size={18} stroke={2} />, tone: "lavender" },
          { key: "inventory", label: "Manage Inventory", href: "/admin/batches", icon: <IconBuildingWarehouse size={18} stroke={2} />, tone: "peach", permission: PERMISSIONS.BATCHES_MANAGE },
          { key: "expense", label: "Add Expense", href: "/admin/expenses?new=1", icon: <IconReceiptTax size={18} stroke={2} />, tone: "lavender", superAdminOnly: true },
        ]}
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Sales vs cost table
// ---------------------------------------------------------------------------

export function TrendTableCard({ summary, error, onRetry }: SummaryProps & { error?: unknown; onRetry?: () => void }) {
  const granularity = summary?.range.granularity === "month" ? "Month" : "Day";
  const columns: ReportColumn<ProfitTrendPoint>[] = [
    { key: "period", header: granularity, cell: (row) => <Text size="sm" fw={500} className={classes.nowrap}>{row.label}</Text>, skeletonWidth: 60 },
    ...PROFIT_BARS.map(
      (bar): ReportColumn<ProfitTrendPoint> => ({
        key: bar.key,
        header: bar.label,
        align: "right",
        minWidth: 90,
        cell: (row) => (
          <Text size="sm" fw={bar.key === "profit" ? 600 : 500} className={classes.num} c={bar.key === "profit" && row.profit < 0 ? "var(--mo-color-danger-8)" : undefined}>
            {formatTaka(row[bar.key])}
          </Text>
        ),
        skeletonWidth: 56,
      }),
    ),
    {
      key: "margin",
      header: "Margin",
      align: "center",
      minWidth: 84,
      cell: (row) => (row.revenue > 0 ? <MarginPill percent={row.marginPercent} size="sm" /> : <Text size="xs" c="var(--mo-color-text-muted)">No sales</Text>),
      skeletonWidth: 52,
    },
  ];
  return (
    <SectionCard title="Sales vs Cost" subtitle={`${granularity === "Day" ? "Daily" : "Monthly"} revenue, cost of goods and gross profit`} flush>
      <ReportTable
        columns={columns}
        rows={summary?.trend}
        getRowKey={(row) => row.period}
        label="Sales versus cost by period"
        loading={!summary}
        error={error}
        onRetry={onRetry}
        skeletonRows={8}
        minWidth={520}
        maxHeight={520}
        emptyTitle="No periods in this range"
      />
    </SectionCard>
  );
}
