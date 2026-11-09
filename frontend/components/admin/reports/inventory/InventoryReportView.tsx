"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Box, Grid, Group, Skeleton, Stack, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconBox,
  IconBuildingWarehouse,
  IconCalendarTime,
  IconCash,
  IconCircleCheck,
  IconClipboardData,
  IconPackageOff,
  IconPackages,
  IconTag,
} from "@tabler/icons-react";
import { StatusBadge } from "../../../StatusBadge";
import { useCan } from "../../../../hooks/admin/use-permission";
import { useInventoryReport } from "../../../../hooks/admin/use-reports";
import { PERMISSIONS } from "../../../../types/auth";
import type { AdminBatchDTO } from "../../../../types/admin";
import type { InventoryDeadStockRow, InventoryLowStockRow } from "../../../../types/admin-reports";
import { ListingStatusBadge } from "../../ListingStatusBadge";
import {
  ChartViewToggle,
  ComboTrendChart,
  DonutWithLegend,
  PageHeader,
  SectionCard,
  Thumb,
  paletteColor,
  type ChartView,
} from "../../kit";
import { QueryError } from "../../QueryError";
import { formatCalendarDate, formatCount, formatDhakaDate, formatDhakaDateTime, pluralize } from "../../format";
import kitClasses from "../../kit/kit.module.css";
import { ReportKpiGrid } from "../ReportKpiGrid";
import { ReportTable, type ReportColumn } from "../ReportTable";
import { SeriesLegend } from "../SeriesLegend";
import { REPORT_GRID_BREAKPOINTS, formatTaka } from "../report-utils";
import classes from "../reports.module.css";

const VALUE_BARS = [
  { key: "valueCost", label: "At cost", color: "accentPurple.6" },
  { key: "valueRetail", label: "At retail", color: "secondaryGreen.6" },
] as const;

function ProductCell({ title, image, href }: { title: string; image: string | null; href?: string }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Thumb src={image} size={34} />
      {href ? (
        <Text component={Link} href={href} size="sm" fw={600} lineClamp={1} className={kitClasses.cellLink}>
          {title}
        </Text>
      ) : (
        <Text size="sm" fw={600} lineClamp={1}>
          {title}
        </Text>
      )}
    </Group>
  );
}

const PRODUCT_SKELETON = (
  <Group gap="sm" wrap="nowrap">
    <Skeleton height={34} width={34} radius="sm" />
    <Skeleton height={11} radius="xl" style={{ flex: 1 }} />
  </Group>
);

/**
 * `/admin/reports/inventory`: a live snapshot (not range-bound) of stock
 * units and value, per-category value, low stock, batches expiring within
 * 30 days and dead stock (`GET /admin/reports/inventory`).
 */
export function InventoryReportView() {
  const { data, error, isLoading, mutate } = useInventoryReport();
  const canOpenProducts = useCan(PERMISSIONS.PRODUCTS_READ);
  const canOpenBatches = useCan(PERMISSIONS.BATCHES_MANAGE);
  const [view, setView] = useState<ChartView>("chart");
  const report = isLoading ? undefined : data;
  const failed = Boolean(error) && !report;
  const productHref = (productId: string) => (canOpenProducts ? `/admin/products?productId=${encodeURIComponent(productId)}` : undefined);
  const batchHref = (productId: string) => (canOpenBatches ? `/admin/batches?productId=${encodeURIComponent(productId)}` : undefined);

  const lowStockColumns: ReportColumn<InventoryLowStockRow>[] = [
    { key: "product", header: "Product", minWidth: 200, cell: (row) => <ProductCell title={row.title} image={row.image} href={productHref(row.productId)} />, skeleton: PRODUCT_SKELETON },
    {
      key: "stock",
      header: "In stock",
      align: "right",
      minWidth: 96,
      cell: (row) => (
        <Badge variant="light" radius="xl" size="sm" tt="none" fw={700} className="mo-tabular-nums" color={row.totalStock <= 0 ? "danger" : "warning"} leftSection={row.totalStock <= 0 ? <IconAlertTriangle size={11} aria-hidden /> : undefined}>
          {row.totalStock <= 0 ? "Out of stock" : `${formatCount(row.totalStock)} left`}
        </Badge>
      ),
      skeletonWidth: 64,
    },
    { key: "threshold", header: "Alert at", align: "right", cell: (row) => <Text size="sm" className={classes.num}>{formatCount(row.lowStockThreshold)}</Text>, skeletonWidth: 24 },
    { key: "listing", header: "Listing", minWidth: 120, cell: (row) => <ListingStatusBadge status={row.listingStatus} />, skeletonWidth: 70 },
  ];

  const expiringColumns: ReportColumn<AdminBatchDTO>[] = [
    {
      key: "product",
      header: "Product",
      minWidth: 170,
      cell: (row) => {
        const href = batchHref(row.productId);
        return href ? (
          <Text component={Link} href={href} size="sm" fw={600} lineClamp={2} className={kitClasses.cellLink}>
            {row.productTitle}
          </Text>
        ) : (
          <Text size="sm" fw={600} lineClamp={2}>
            {row.productTitle}
          </Text>
        );
      },
      skeletonWidth: "80%",
    },
    { key: "batch", header: "Batch", cell: (row) => <Text className={classes.mono}>{row.batchNumber}</Text>, skeletonWidth: 80 },
    {
      key: "expiry",
      header: "Expires",
      minWidth: 100,
      cell: (row) => (
        <Box>
          <Text size="sm" className={classes.nowrap}>
            {formatCalendarDate(row.expiryDate)}
          </Text>
          <Text size="xs" c="var(--mo-color-text-warning)" className={classes.nowrap}>
            {row.daysUntilExpiry <= 0 ? "Today" : `in ${pluralize(row.daysUntilExpiry, "day")}`}
          </Text>
        </Box>
      ),
      skeletonWidth: 72,
    },
    { key: "units", header: "Units", align: "right", cell: (row) => <Text size="sm" className={classes.num}>{formatCount(row.availableQuantity)}</Text>, skeletonWidth: 24 },
    { key: "status", header: "Status", minWidth: 130, cell: (row) => <StatusBadge status={row.healthStatus} size="sm" style={{ maxWidth: "none" }} />, skeletonWidth: 80 },
  ];

  const deadStockColumns: ReportColumn<InventoryDeadStockRow>[] = [
    { key: "product", header: "Product", minWidth: 220, cell: (row) => <ProductCell title={row.title} image={row.image} href={productHref(row.productId)} />, skeleton: PRODUCT_SKELETON },
    { key: "stock", header: "Units in stock", align: "right", cell: (row) => <Text size="sm" fw={600} className={classes.num}>{formatCount(row.totalStock)}</Text>, skeletonWidth: 32 },
    {
      key: "lastSold",
      header: "Last sold",
      minWidth: 110,
      cell: (row) =>
        row.lastSoldAt ? (
          <Text component="time" dateTime={row.lastSoldAt} title={formatDhakaDateTime(row.lastSoldAt)} size="sm" c="var(--mo-color-text-secondary)" className={classes.nowrap}>
            {formatDhakaDate(row.lastSoldAt)}
          </Text>
        ) : (
          <Badge variant="light" color="gray" radius="xl" size="sm" tt="none" fw={600}>
            Never sold
          </Badge>
        ),
      skeletonWidth: 72,
    },
    {
      key: "idle",
      header: "Days without a sale",
      align: "right",
      cell: (row) => (
        <Text size="sm" className={classes.num} c="var(--mo-color-text-secondary)">
          {row.daysSinceLastSale === null ? "—" : formatCount(row.daysSinceLastSale)}
        </Text>
      ),
      skeletonWidth: 32,
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconClipboardData size={18} aria-hidden />}
        title="Inventory Report"
        subtitle="A live snapshot of stock, its value and what needs attention."
        mb={0}
      />

      {failed ? (
        <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.ANALYTICS_READ} title="We couldn't load the inventory report" />
      ) : (
        <>
          <ReportKpiGrid
            items={[
              { key: "products", tone: "lavender", icon: <IconPackages size={24} stroke={1.8} />, label: "Products", value: report ? formatCount(report.totals.productCount) : undefined, hint: "In the catalog", loading: !report },
              {
                key: "active",
                tone: "mint",
                icon: <IconCircleCheck size={24} stroke={1.8} />,
                label: "Active Listings",
                value: report ? formatCount(report.totals.activeCount) : undefined,
                hint: report ? `of ${pluralize(report.totals.productCount, "product")}` : undefined,
                loading: !report,
              },
              { key: "units", tone: "sky", icon: <IconBox size={24} stroke={1.8} />, label: "Units in Stock", value: report ? formatCount(report.totals.stockUnits) : undefined, hint: "Sellable batches", loading: !report },
              { key: "cost", tone: "peach", icon: <IconCash size={24} stroke={1.8} />, label: "Value at Cost", value: report ? formatTaka(report.totals.stockValueCost) : undefined, hint: "Stock × cost price", loading: !report },
              { key: "retail", tone: "rose", icon: <IconTag size={24} stroke={1.8} />, label: "Value at Retail", value: report ? formatTaka(report.totals.stockValueRetail) : undefined, hint: "Stock × list price", loading: !report },
            ]}
          />

          <Grid type="container" breakpoints={REPORT_GRID_BREAKPOINTS} gap="md">
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <SectionCard
                title="Stock Value by Category"
                subtitle="At cost and at retail (list price)"
                actions={<ChartViewToggle value={view} onChange={setView} subject="stock value by category" />}
              >
                {view === "chart" && report?.byCategory.some((row) => row.valueCost !== 0 || row.valueRetail !== 0) ? <SeriesLegend items={VALUE_BARS} /> : null}
                <ComboTrendChart
                  data={report?.byCategory.map((row) => ({ label: row.name, valueCost: row.valueCost, valueRetail: row.valueRetail }))}
                  loading={!report}
                  bars={VALUE_BARS}
                  withLegend={false}
                  height={290}
                  view={view}
                  ariaLabel="Stock value by category"
                  emptyTitle="No stock on hand"
                  emptyDescription="Import a batch to see stock value here."
                />
              </SectionCard>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <SectionCard title="Units by Category" subtitle="Where your stock sits">
                <Box py={4}>
                  <DonutWithLegend
                    data={report?.byCategory.map((row, index) => ({ key: row.categoryId, label: row.name, value: row.stockUnits, color: paletteColor(index) }))}
                    loading={!report}
                    totalLabel="Units"
                    size={164}
                    thickness={22}
                    emptyTitle="No stock on hand"
                  />
                </Box>
              </SectionCard>
            </Grid.Col>

            <Grid.Col span={{ base: 12, xl: 6 }}>
              <SectionCard
                title="Low Stock"
                subtitle={report ? `${pluralize(report.lowStock.length, "product")} at or below the alert level` : "At or below the alert level"}
                icon={<IconAlertTriangle size={18} color="var(--mo-color-warning-8)" aria-hidden />}
                viewAllHref={canOpenProducts ? "/admin/products" : undefined}
                flush
              >
                <ReportTable
                  columns={lowStockColumns}
                  rows={report?.lowStock}
                  getRowKey={(row) => row.productId}
                  label="Low stock products"
                  loading={!report}
                  minWidth={520}
                  maxHeight={420}
                  emptyTitle="Stock looks healthy"
                  emptyDescription="No product is at or below its alert level."
                  emptyIcon={<IconBuildingWarehouse stroke={1.6} />}
                />
              </SectionCard>
            </Grid.Col>
            <Grid.Col span={{ base: 12, xl: 6 }}>
              <SectionCard
                title="Expiring Soon"
                subtitle="Batches with stock that expire within 30 days"
                icon={<IconCalendarTime size={18} color="var(--mo-color-warning-8)" aria-hidden />}
                viewAllHref={canOpenBatches ? "/admin/expiry" : undefined}
                flush
              >
                <ReportTable
                  columns={expiringColumns}
                  rows={report?.expiringSoon}
                  getRowKey={(row) => row.id}
                  label="Batches expiring soon"
                  loading={!report}
                  minWidth={560}
                  maxHeight={420}
                  emptyTitle="Nothing expires in the next 30 days"
                  emptyDescription="Batches close to expiry appear here so you can sell them first."
                  emptyIcon={<IconCalendarTime stroke={1.6} />}
                />
              </SectionCard>
            </Grid.Col>
            <Grid.Col span={12}>
              <SectionCard
                title="Dead Stock"
                subtitle="In stock with no sale in the last 60 days (never-sold products included)"
                icon={<IconPackageOff size={18} color="var(--mo-color-text-secondary)" aria-hidden />}
                flush
              >
                <ReportTable
                  columns={deadStockColumns}
                  rows={report?.deadStock}
                  getRowKey={(row) => row.productId}
                  label="Dead stock"
                  loading={!report}
                  minWidth={560}
                  maxHeight={460}
                  emptyTitle="No dead stock"
                  emptyDescription="Every product in stock has sold in the last 60 days."
                  emptyIcon={<IconPackages stroke={1.6} />}
                />
              </SectionCard>
            </Grid.Col>
          </Grid>
        </>
      )}
    </Stack>
  );
}
