"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Box, Button, Grid, Group, Select, Skeleton, Stack, Text, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconCash, IconDownload, IconPackage, IconPackages, IconSearch, IconShoppingBag } from "@tabler/icons-react";
import { useCan } from "../../../../hooks/admin/use-permission";
import { fetchAllProductReportRows, useProductsReport, useReportCategories } from "../../../../hooks/admin/use-reports";
import { getErrorMessage } from "../../../../lib/api-client";
import { downloadCsv, toCsv, type CsvColumn } from "../../../../lib/csv";
import { PERMISSIONS } from "../../../../types/auth";
import { PRODUCT_REPORT_SORTS, type ProductReportRow, type ProductReportSort } from "../../../../types/admin-reports";
import { DateRangePicker, PageHeader, ProgressList, SectionCard, Thumb, formatRangeDates, paletteColor } from "../../kit";
import { QueryError } from "../../QueryError";
import { formatCount, formatDhakaDate, formatDhakaDateTime, formatMoney } from "../../format";
import kitClasses from "../../kit/kit.module.css";
import { ReportKpiGrid } from "../ReportKpiGrid";
import { ReportTable, type ReportColumn } from "../ReportTable";
import { REPORT_GRID_BREAKPOINTS, formatTaka, rangeFileSuffix } from "../report-utils";
import { useUrlDateRange, useUrlEnum, useUrlString } from "../url-state";
import classes from "../reports.module.css";

const SORT_LABELS: Record<ProductReportSort, string> = {
  revenue_desc: "Most revenue",
  units_desc: "Most units sold",
  title_asc: "Name (A–Z)",
  stock_asc: "Lowest stock",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CSV_COLUMNS: readonly CsvColumn<ProductReportRow>[] = [
  { header: "Product", value: (row) => row.title },
  { header: "SKU", value: (row) => row.sku },
  { header: "Category", value: (row) => row.category?.name ?? "" },
  { header: "Units sold", value: (row) => row.unitsSold },
  { header: "Revenue (BDT)", value: (row) => row.revenue },
  { header: "Orders", value: (row) => row.ordersCount },
  { header: "Avg selling price (BDT)", value: (row) => row.avgSellingPrice },
  { header: "Current stock", value: (row) => row.currentStock },
  { header: "Last sold (Dhaka)", value: (row) => (row.lastSoldAt ? formatDhakaDateTime(row.lastSoldAt) : "Never") },
  { header: "Status", value: (row) => (row.isActive ? "Active" : "Inactive") },
];

/**
 * `/admin/reports/products`: units, revenue and stock per product for any
 * period (`GET /admin/reports/products`), with totals, a top-10 revenue list
 * and CSV export. Period, category and sort live in the URL.
 */
export function ProductsReportView() {
  const [range, setRange] = useUrlDateRange("last30");
  const [rawCategoryId, setCategoryId] = useUrlString("categoryId");
  const categoryId = rawCategoryId && UUID.test(rawCategoryId) ? rawCategoryId : null;
  const [sort, setSort] = useUrlEnum<ProductReportSort>("sort", PRODUCT_REPORT_SORTS, "revenue_desc");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search.trim(), 300);
  const canOpenProducts = useCan(PERMISSIONS.PRODUCTS_READ);
  const categories = useReportCategories();

  const signature = `${range.from}|${range.to}|${categoryId ?? ""}|${sort}|${debouncedSearch}`;
  const [paging, setPaging] = useState({ signature, page: 1, limit: 20 });
  const page = paging.signature === signature ? paging.page : 1;

  const list = useProductsReport({ from: range.from, to: range.to, q: debouncedSearch, categoryId, sort, page, limit: paging.limit });
  // KPIs and the top 10 follow the period and category, not the search box.
  const top = useProductsReport({ from: range.from, to: range.to, categoryId, sort: "revenue_desc", page: 1, limit: 10 });
  const topPage = top.isLoading ? undefined : top.data;

  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const exportCsv = useCallback(async () => {
    if (exportingRef.current) {
      return;
    }
    exportingRef.current = true;
    setExporting(true);
    try {
      const result = await fetchAllProductReportRows({ from: range.from, to: range.to, q: debouncedSearch, categoryId, sort }, { maxRows: 5000 });
      if (result.items.length === 0) {
        notifications.show({ color: "warning", title: "Nothing to export", message: "No products match these filters." });
        return;
      }
      downloadCsv(`product-report_${rangeFileSuffix(range)}.csv`, toCsv(result.items, CSV_COLUMNS));
      notifications.show({
        color: result.truncated ? "warning" : "success",
        title: result.truncated ? "Export capped" : "Report exported",
        message: result.truncated
          ? `Saved the first ${formatCount(result.items.length)} of ${formatCount(result.total)} products.`
          : `Saved ${formatCount(result.items.length)} products to CSV.`,
      });
    } catch (error) {
      notifications.show({ color: "danger", title: "Export failed", message: getErrorMessage(error) });
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }, [categoryId, debouncedSearch, range, sort]);

  const categoryIndex = new Map((categories.data ?? []).map((category, index) => [category.id, index]));
  const categoryName = categoryId ? categories.data?.find((category) => category.id === categoryId)?.name : undefined;
  const scope = categoryName ? `${categoryName} · ${formatRangeDates(range)}` : formatRangeDates(range);

  const columns: ReportColumn<ProductReportRow>[] = [
    {
      key: "product",
      header: "Product",
      minWidth: 240,
      cell: (row) => (
        <Group gap="sm" wrap="nowrap">
          <Thumb src={row.image} size={36} />
          <Box style={{ minWidth: 0 }}>
            {canOpenProducts ? (
              <Text component={Link} href={`/admin/products?productId=${encodeURIComponent(row.productId)}`} size="sm" fw={600} lineClamp={1} className={kitClasses.cellLink}>
                {row.title}
              </Text>
            ) : (
              <Text size="sm" fw={600} lineClamp={1}>
                {row.title}
              </Text>
            )}
            <Text size="xs" c="var(--mo-color-text-muted)" lineClamp={1}>
              {row.sku}
            </Text>
          </Box>
        </Group>
      ),
      skeleton: (
        <Group gap="sm" wrap="nowrap">
          <Skeleton height={36} width={36} radius="sm" />
          <Box style={{ flex: 1 }}>
            <Skeleton height={11} width="75%" radius="xl" />
            <Skeleton height={9} width="40%" radius="xl" mt={7} />
          </Box>
        </Group>
      ),
    },
    {
      key: "category",
      header: "Category",
      minWidth: 110,
      cell: (row) =>
        row.category ? (
          <Badge variant="light" radius="xl" size="sm" tt="none" fw={600} color={paletteColor(categoryIndex.get(row.category.id) ?? 0)} maw={150}>
            {row.category.name}
          </Badge>
        ) : (
          <Text size="xs" c="var(--mo-color-text-muted)">
            Uncategorised
          </Text>
        ),
      skeletonWidth: 72,
    },
    { key: "units", header: "Units sold", align: "right", cell: (row) => <Text size="sm" className={classes.num}>{formatCount(row.unitsSold)}</Text>, skeletonWidth: 32 },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      minWidth: 96,
      cell: (row) => (
        <Text size="sm" fw={600} className={classes.num}>
          {formatMoney(row.revenue)}
        </Text>
      ),
      skeletonWidth: 64,
    },
    { key: "orders", header: "Orders", align: "right", cell: (row) => <Text size="sm" className={classes.num}>{formatCount(row.ordersCount)}</Text>, skeletonWidth: 28 },
    {
      key: "avg",
      header: "Avg. price",
      align: "right",
      minWidth: 88,
      cell: (row) => (
        <Text size="sm" className={classes.num} c={row.unitsSold === 0 ? "var(--mo-color-text-muted)" : undefined}>
          {row.unitsSold === 0 ? "—" : formatMoney(row.avgSellingPrice)}
        </Text>
      ),
      skeletonWidth: 56,
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      cell: (row) => (
        <Text size="sm" fw={row.currentStock <= 0 ? 700 : 500} className={classes.num} c={row.currentStock <= 0 ? "var(--mo-color-danger-8)" : undefined}>
          {row.currentStock <= 0 ? "Out" : formatCount(row.currentStock)}
        </Text>
      ),
      skeletonWidth: 28,
    },
    {
      key: "lastSold",
      header: "Last sold",
      minWidth: 100,
      cell: (row) =>
        row.lastSoldAt ? (
          <Text component="time" dateTime={row.lastSoldAt} title={formatDhakaDateTime(row.lastSoldAt)} size="sm" c="var(--mo-color-text-secondary)" className={classes.nowrap}>
            {formatDhakaDate(row.lastSoldAt)}
          </Text>
        ) : (
          <Text size="sm" c="var(--mo-color-text-muted)">
            Never
          </Text>
        ),
      skeletonWidth: 72,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <Badge variant="light" radius="xl" size="sm" tt="none" fw={600} color={row.isActive ? "success" : "gray"}>
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      skeletonWidth: 52,
    },
  ];

  const topItems = topPage?.items
    .filter((row) => row.revenue > 0)
    .map((row) => ({
      key: row.productId,
      label: row.title,
      percent: topPage.meta.totals.revenue > 0 ? (row.revenue / topPage.meta.totals.revenue) * 100 : 0,
      value: formatTaka(row.revenue),
    }));

  const listPage = list.data;
  const filtered = debouncedSearch !== "" || categoryId !== null;
  const failed = Boolean(top.error) && !top.data;

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconPackages size={18} aria-hidden />}
        title="Product Report"
        subtitle="Units sold, revenue and stock for every product."
        actions={<DateRangePicker value={range} onChange={setRange} label="Report period" />}
        mb={0}
      />

      {failed ? (
        <QueryError error={top.error} onRetry={() => void top.mutate()} permission={PERMISSIONS.ANALYTICS_READ} title="We couldn't load the product report" />
      ) : (
        <Grid type="container" breakpoints={REPORT_GRID_BREAKPOINTS} gap="md">
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <ReportKpiGrid
              items={[
                {
                  key: "revenue",
                  tone: "mint",
                  icon: <IconCash size={24} stroke={1.8} />,
                  label: "Product Revenue",
                  value: topPage ? formatTaka(topPage.meta.totals.revenue) : undefined,
                  hint: "After coupons, excl. delivery fees",
                  loading: !topPage,
                },
                {
                  key: "units",
                  tone: "peach",
                  icon: <IconShoppingBag size={24} stroke={1.8} />,
                  label: "Units Sold",
                  value: topPage ? formatCount(topPage.meta.totals.unitsSold) : undefined,
                  hint: "In revenue orders",
                  loading: !topPage,
                },
                {
                  key: "products",
                  tone: "lavender",
                  icon: <IconPackage size={24} stroke={1.8} />,
                  label: "Products",
                  value: topPage ? formatCount(topPage.meta.total) : undefined,
                  hint: categoryName ? `In ${categoryName}` : "Across the catalog",
                  loading: !topPage,
                },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <SectionCard title="Top 10 by Revenue" subtitle={`Share of product revenue · ${scope}`}>
              <ProgressList
                items={topItems}
                loading={!topPage}
                skeletonCount={10}
                labelWidth={190}
                emptyTitle="No sales in this period"
                emptyDescription="Best sellers appear once orders come in."
              />
            </SectionCard>
          </Grid.Col>
          <Grid.Col span={12}>
            <SectionCard title="Product Performance" subtitle={scope} flush>
              <Group justify="space-between" gap="sm" px="lg" pb="md" wrap="wrap" align="flex-end">
                <Group gap="xs" wrap="wrap" align="flex-end">
                  <TextInput
                    size="xs"
                    radius="xl"
                    w={220}
                    placeholder="Search name or SKU…"
                    aria-label="Search products"
                    leftSection={<IconSearch size={14} aria-hidden />}
                    value={search}
                    onChange={(event) => setSearch(event.currentTarget.value)}
                  />
                  <Select
                    size="xs"
                    radius="xl"
                    w={170}
                    placeholder="All Categories"
                    aria-label="Filter by category"
                    clearable
                    value={categoryId}
                    onChange={setCategoryId}
                    data={(categories.data ?? []).map((category) => ({ value: category.id, label: category.name }))}
                    comboboxProps={{ withinPortal: true }}
                  />
                  <Select
                    size="xs"
                    radius="xl"
                    w={170}
                    aria-label="Sort products"
                    allowDeselect={false}
                    value={sort}
                    onChange={(value) => setSort(PRODUCT_REPORT_SORTS.find((option) => option === value) ?? "revenue_desc")}
                    data={PRODUCT_REPORT_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))}
                    comboboxProps={{ withinPortal: true }}
                  />
                </Group>
                <Button
                  size="xs"
                  radius="xl"
                  variant="default"
                  leftSection={<IconDownload size={14} aria-hidden />}
                  onClick={() => void exportCsv()}
                  loading={exporting}
                  disabled={!listPage || listPage.meta.total === 0}
                >
                  Export CSV
                </Button>
              </Group>
              <ReportTable
                columns={columns}
                rows={listPage?.items}
                getRowKey={(row) => row.productId}
                label="Product performance"
                loading={list.isLoading && !listPage}
                refreshing={list.isLoading && Boolean(listPage)}
                error={list.error}
                onRetry={() => void list.mutate()}
                skeletonRows={10}
                minWidth={1040}
                emptyTitle={filtered ? "No products match these filters" : "No products yet"}
                emptyDescription={filtered ? "Clear the search or pick another category." : "Products appear here once they are added to the catalog."}
                emptyIcon={<IconPackages stroke={1.6} />}
                pagination={
                  listPage
                    ? {
                        page: listPage.meta.page,
                        totalPages: listPage.meta.totalPages,
                        total: listPage.meta.total,
                        limit: listPage.meta.limit,
                        onPageChange: (next) => setPaging({ signature, page: next, limit: paging.limit }),
                        onLimitChange: (limit) => setPaging({ signature, page: 1, limit }),
                        itemLabel: "products",
                      }
                    : undefined
                }
              />
            </SectionCard>
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}
