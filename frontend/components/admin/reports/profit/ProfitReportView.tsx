"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Grid, ScrollArea, Stack, Tabs } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconChartHistogram } from "@tabler/icons-react";
import { useCan } from "../../../../hooks/admin/use-permission";
import { useProfitProducts, useProfitSummary, useReportCategories } from "../../../../hooks/admin/use-reports";
import { PERMISSIONS } from "../../../../types/auth";
import type { ProfitProductSort } from "../../../../types/admin-reports";
import { DateRangePicker, PageHeader, SectionCard } from "../../kit";
import { QueryError } from "../../QueryError";
import { REPORT_GRID_BREAKPOINTS } from "../report-utils";
import { rangeQuery, useUrlDateRange, useUrlEnum } from "../url-state";
import classes from "../reports.module.css";
import { ProductProfitDetailCard } from "./ProductProfitDetail";
import { ProductProfitTable, type ProfitTableVariant } from "./ProductProfitTable";
import {
  CategoryChartCard,
  CategoryProfitCard,
  CostKpis,
  ExpenseBreakdownCard,
  ProfitActionsCard,
  ProfitKpis,
  ProfitTrendCard,
  TopProfitableCard,
  TrendTableCard,
} from "./ProfitSections";
import { useProfitExport } from "./use-profit-export";

const TABS = ["overview", "products", "categories", "sales-vs-cost", "detailed"] as const;
type ProfitTab = (typeof TABS)[number];

const TAB_LABELS: Record<ProfitTab, string> = {
  overview: "Overview",
  products: "Product Profitability",
  categories: "Category Profitability",
  "sales-vs-cost": "Sales vs Cost",
  detailed: "Detailed Report",
};

/** The product table each tab shows (none on the category and sales-vs-cost tabs). */
const TABLE_FOR_TAB: Record<ProfitTab, ProfitTableVariant | null> = {
  overview: "compact",
  products: "full",
  categories: null,
  "sales-vs-cost": null,
  detailed: "detailed",
};

const DEFAULT_LIMITS: Record<ProfitTableVariant, number> = { compact: 10, full: 10, detailed: 20 };

type Paging = Record<ProfitTableVariant, { page: number; limit: number }>;

const firstPages = (limits: Paging): Paging => ({
  compact: { page: 1, limit: limits.compact.limit },
  full: { page: 1, limit: limits.full.limit },
  detailed: { page: 1, limit: limits.detailed.limit },
});

/**
 * `/admin/reports/profit` (mockup 3, SUPER_ADMIN): profit KPIs, trend,
 * category and product profitability with a per-product cost breakdown,
 * expense mix and CSV export. Period and tab live in the URL.
 */
export function ProfitReportView() {
  const pathname = usePathname();
  const [range, setRange] = useUrlDateRange("last30");
  const [tab, setTab] = useUrlEnum<ProfitTab>("tab", TABS, "overview");
  const canOpenProducts = useCan(PERMISSIONS.PRODUCTS_READ);

  const summaryQuery = useProfitSummary(range);
  const summary = summaryQuery.isLoading ? undefined : summaryQuery.data;
  const summaryFailed = Boolean(summaryQuery.error) && !summary;
  const retrySummary = () => void summaryQuery.mutate();

  // Product table filters are shared by every tab; pages are per table.
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search.trim(), 300);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sort, setSort] = useState<ProfitProductSort>("profit_desc");
  const signature = `${range.from}|${range.to}|${debouncedSearch}|${categoryId ?? ""}|${sort}`;
  const [pagingState, setPagingState] = useState<{ signature: string; paging: Paging }>(() => ({
    signature,
    paging: {
      compact: { page: 1, limit: DEFAULT_LIMITS.compact },
      full: { page: 1, limit: DEFAULT_LIMITS.full },
      detailed: { page: 1, limit: DEFAULT_LIMITS.detailed },
    },
  }));
  // A new period or filter starts every table on page 1 (derived, no effect needed).
  const paging = pagingState.signature === signature ? pagingState.paging : firstPages(pagingState.paging);
  const variant = TABLE_FOR_TAB[tab];
  const current = paging[variant ?? "compact"];
  const setPaging = (next: Partial<{ page: number; limit: number }>) => {
    if (!variant) {
      return;
    }
    setPagingState({ signature, paging: { ...paging, [variant]: { ...paging[variant], ...next, ...(next.limit ? { page: 1 } : {}) } } });
  };

  const products = useProfitProducts(
    { from: range.from, to: range.to, q: debouncedSearch, categoryId, sort, page: current.page, limit: current.limit },
    variant !== null,
  );
  const categories = useReportCategories();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const firstRowId = products.data?.items[0]?.productId ?? null;
  const detailId = selectedId ?? firstRowId;

  const exportFilter = useMemo(
    () => ({ from: range.from, to: range.to, q: debouncedSearch, categoryId, sort }),
    [range.from, range.to, debouncedSearch, categoryId, sort],
  );
  const { exporting, exportCsv } = useProfitExport(exportFilter);

  const tabHref = (target: ProfitTab) => `${pathname}?${rangeQuery(range)}${target === "overview" ? "" : `&tab=${target}`}`;

  const selectProduct = (productId: string) => {
    setSelectedId(productId);
    if (tab !== "overview" && tab !== "products") {
      setTab("products");
    }
  };

  const productTable = variant ? (
    <SectionCard title={variant === "detailed" ? "Detailed Product Report" : "Product Profitability"} subtitle={variant === "compact" ? undefined : "Average realised price and unit cost over the period"} flush>
      <ProductProfitTable
        variant={variant}
        page={products.data}
        loading={products.isLoading && !products.data}
        refreshing={products.isLoading && Boolean(products.data)}
        error={products.error}
        onRetry={() => void products.mutate()}
        search={search}
        onSearchChange={setSearch}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        sort={sort}
        onSortChange={setSort}
        categories={categories.data}
        onPageChange={(page) => setPaging({ page })}
        onLimitChange={variant === "compact" ? undefined : (limit) => setPaging({ limit })}
        selectedId={variant === "detailed" ? undefined : detailId}
        onSelect={variant === "detailed" ? undefined : setSelectedId}
        exporting={exporting}
        onExport={() => void exportCsv()}
        canOpenProducts={canOpenProducts}
      />
    </SectionCard>
  ) : null;

  const detailCard = (
    <ProductProfitDetailCard
      productId={detailId}
      range={range}
      listReady={Boolean(products.data) || Boolean(products.error)}
      canOpenProducts={canOpenProducts}
    />
  );

  const summaryError = summaryFailed ? (
    <QueryError error={summaryQuery.error} onRetry={retrySummary} title="We couldn't load the profit report" />
  ) : null;

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconChartHistogram size={18} aria-hidden />}
        title="Profit & Margin Report"
        subtitle="Track your business profitability with detailed product, category and overall margin analysis."
        actions={<DateRangePicker value={range} onChange={setRange} label="Report period" />}
        mb={0}
      />

      <Tabs
        value={tab}
        onChange={(next) => setTab(TABS.find((candidate) => candidate === next) ?? "overview")}
        variant="pills"
        radius="xl"
        color="secondaryGreen.8"
        keepMounted={false}
      >
        <ScrollArea type="never" offsetScrollbars={false} mb="lg">
          <Tabs.List className={classes.tabsList} aria-label="Profit report views">
            {TABS.map((value) => (
              <Tabs.Tab key={value} value={value} className={classes.tab}>
                {TAB_LABELS[value]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </ScrollArea>

        <Tabs.Panel value="overview">
          <Stack gap="md">
            {summaryError ?? <ProfitKpis summary={summary} range={range} />}
            <Grid type="container" breakpoints={REPORT_GRID_BREAKPOINTS} gap="md">
              {summaryFailed ? null : (
                <>
                  <Grid.Col span={{ base: 12, lg: 6 }}>
                    <ProfitTrendCard summary={summary} range={range} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, lg: 6 }}>
                    <CategoryProfitCard summary={summary} viewAllHref={tabHref("categories")} />
                  </Grid.Col>
                </>
              )}
              <Grid.Col span={{ base: 12, lg: 8 }}>{productTable}</Grid.Col>
              <Grid.Col span={{ base: 12, lg: 4 }}>{detailCard}</Grid.Col>
              {summaryFailed ? null : (
                <>
                  <Grid.Col span={{ base: 12, md: 6, xl: 4 }}>
                    <TopProfitableCard summary={summary} onSelect={selectProduct} viewAllHref={tabHref("products")} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6, xl: 5 }}>
                    <ExpenseBreakdownCard summary={summary} viewAllHref={`/admin/expenses?${rangeQuery(range)}`} />
                  </Grid.Col>
                </>
              )}
              <Grid.Col span={{ base: 12, xl: 3 }}>
                <ProfitActionsCard exporting={exporting} onExport={() => void exportCsv()} />
              </Grid.Col>
            </Grid>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="products">
          <Stack gap="md">
            {productTable}
            {detailCard}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="categories">
          {summaryError ?? (
            <Stack gap="md">
              <CategoryChartCard summary={summary} range={range} />
              <CategoryProfitCard summary={summary} full />
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="sales-vs-cost">
          {summaryError ?? (
            <Stack gap="md">
              <CostKpis summary={summary} range={range} />
              <ProfitTrendCard summary={summary} range={range} height={340} />
              <TrendTableCard summary={summary} />
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="detailed">{productTable}</Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
