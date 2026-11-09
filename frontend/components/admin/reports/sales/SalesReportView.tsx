"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, Box, Button, Grid, Group, Select, Skeleton, Stack, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconChartBar,
  IconCash,
  IconClipboardList,
  IconDiscount,
  IconPackage,
  IconPlus,
  IconShoppingBag,
  IconShoppingCart,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import { EmptyState } from "../../../EmptyState";
import { STATUS_CONFIG, StatusBadge } from "../../../StatusBadge";
import { useAdminActivity } from "../../../../hooks/admin/use-activity";
import { useCan } from "../../../../hooks/admin/use-permission";
import { useAdminSummary } from "../../../../hooks/admin/use-telemetry";
import { PERMISSIONS } from "../../../../types/auth";
import { ADMIN_ORDER_STATUSES } from "../../../../types/admin";
import type { AdminDashboardSummary } from "../../../../types/admin-dashboard";
import {
  ActivityFeed,
  AreaTrendChart,
  ChartViewToggle,
  DateRangePicker,
  DonutWithLegend,
  PageHeader,
  ProgressList,
  QuickActions,
  RankedProductList,
  SectionCard,
  Thumb,
  TONES,
  formatRangeDates,
  previousPeriodCaption,
  rangeDays,
  useNow,
  type ChartView,
  type DateRangeValue,
  type KpiTone,
  type QuickAction,
} from "../../kit";
import { QueryError } from "../../QueryError";
import {
  formatCount,
  formatDhakaDate,
  formatDhakaDateTime,
  formatDhakaTime,
  formatMoney,
  formatRelativeTimeShort,
  initialsOf,
  pluralize,
} from "../../format";
import kitClasses from "../../kit/kit.module.css";
import { ReportKpiGrid } from "../ReportKpiGrid";
import { ReportTable, type ReportColumn } from "../ReportTable";
import { REPORT_GRID_BREAKPOINTS } from "../report-utils";
import { rangeQuery, useUrlDateRange } from "../url-state";
import classes from "../reports.module.css";

interface Access {
  orders: boolean;
  products: boolean;
}

interface SectionProps {
  data: AdminDashboardSummary | undefined;
  range: DateRangeValue;
}

const AVATAR_TONES: readonly KpiTone[] = ["lavender", "sky", "mint", "peach", "rose"];

/**
 * `/admin/reports/sales` (mockup 2): KPIs, revenue / orders trend, recent
 * orders, best sellers, customers, categories and activity for any period
 * (`GET /admin/analytics/summary?from&to`). The period lives in the URL.
 */
export function SalesReportView() {
  const [range, setRange] = useUrlDateRange("last30");
  const { data, error, isLoading, mutate } = useAdminSummary(range);
  const access: Access = {
    orders: useCan(PERMISSIONS.ORDERS_READ),
    products: useCan(PERMISSIONS.PRODUCTS_READ),
  };
  // While a new period loads, SWR keeps the previous period's payload: show skeletons, not old numbers.
  const summary = isLoading ? undefined : data;
  const failed = Boolean(error) && !summary;

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconChartBar size={18} aria-hidden />}
        title="Sales Overview"
        subtitle="Track your store performance with detailed insights."
        actions={<DateRangePicker value={range} onChange={setRange} label="Report period" />}
        mb={0}
      />

      {failed ? (
        <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.ANALYTICS_READ} title="We couldn't load the sales report" />
      ) : (
        <>
          <SalesKpis data={summary} range={range} />
          <Grid type="container" breakpoints={REPORT_GRID_BREAKPOINTS} gap="md">
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <SalesTrendCard data={summary} range={range} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <OrdersByStatusCard data={summary} range={range} access={access} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <RecentOrdersCard data={summary} access={access} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <TopProductsCard data={summary} range={range} access={access} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
              <LatestCustomersCard data={summary} range={range} access={access} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
              <SalesByCategoryCard data={summary} range={range} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
              <RecentActivityCard />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
              <SectionCard title="Quick Actions">
                <QuickActions actions={SALES_ACTIONS} cols={2} />
              </SectionCard>
            </Grid.Col>
          </Grid>
        </>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

function SalesKpis({ data, range }: SectionProps) {
  const caption = previousPeriodCaption(range);
  const loading = !data;
  return (
    <ReportKpiGrid
      items={[
        {
          key: "revenue",
          tone: "mint",
          icon: <IconCash size={24} stroke={1.8} />,
          label: "Total Revenue",
          kpi: data?.kpis.revenue,
          format: "currency",
          trendCaption: caption,
          hint: "Excludes cancelled and refunded orders",
          loading,
        },
        {
          key: "orders",
          tone: "lavender",
          icon: <IconShoppingCart size={24} stroke={1.8} />,
          label: "Total Orders",
          kpi: data?.kpis.orders,
          format: "count",
          trendCaption: caption,
          hint: "Orders placed in this period",
          loading,
        },
        {
          key: "customers",
          tone: "sky",
          icon: <IconUsers size={24} stroke={1.8} />,
          label: "Total Customers",
          kpi: data?.kpis.customers,
          format: "count",
          trendCaption: caption,
          hint: "Registered customer accounts",
          loading,
        },
        {
          key: "sold",
          tone: "peach",
          icon: <IconPackage size={24} stroke={1.8} />,
          label: "Products Sold",
          kpi: data?.kpis.productsSold,
          format: "count",
          trendCaption: caption,
          hint: "Units in revenue orders",
          loading,
        },
        {
          key: "low-stock",
          tone: "rose",
          icon: <IconAlertTriangle size={24} stroke={1.8} />,
          label: "Low Stock Items",
          value: data ? formatCount(data.lowStockCount) : undefined,
          href: "/admin/reports/inventory",
          linkLabel: "View Details",
          loading,
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

type SalesMetric = "revenue" | "orders";

function SalesTrendCard({ data, range }: SectionProps) {
  const [metric, setMetric] = useState<SalesMetric>("revenue");
  const [view, setView] = useState<ChartView>("chart");
  const granularity = data?.range.granularity ?? (rangeDays(range) > 92 ? "month" : "day");
  const points = data?.revenueSeries.map((point) => ({
    label: point.label,
    period: point.period,
    value: metric === "revenue" ? point.revenue : point.orders,
  }));
  const periodText = formatRangeDates(range);
  return (
    <SectionCard
      title="Sales Overview"
      subtitle={`${granularity === "month" ? "Monthly" : "Daily"} ${metric === "revenue" ? "revenue" : "orders"} · ${periodText}`}
      actions={
        <>
          <Select
            size="xs"
            radius="xl"
            w={112}
            aria-label="Chart metric"
            allowDeselect={false}
            value={metric}
            onChange={(next) => setMetric(next === "orders" ? "orders" : "revenue")}
            data={[
              { value: "revenue", label: "Revenue" },
              { value: "orders", label: "Orders" },
            ]}
            comboboxProps={{ withinPortal: true }}
          />
          <ChartViewToggle value={view} onChange={setView} subject="sales" />
        </>
      }
    >
      <AreaTrendChart
        data={points}
        loading={!data}
        seriesLabel={metric === "revenue" ? "Revenue" : "Orders"}
        format={metric === "revenue" ? "currency" : "count"}
        view={view}
        periodLabel={periodText}
        height={280}
        emptyTitle={metric === "revenue" ? "No revenue in this period" : "No orders in this period"}
        emptyDescription="Try a longer period, or check back once customers check out."
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Orders by status
// ---------------------------------------------------------------------------

function OrdersByStatusCard({ data, range, access }: SectionProps & { access: Access }) {
  const segments = data
    ? ADMIN_ORDER_STATUSES.map((status) => {
        const config = STATUS_CONFIG[status];
        return {
          key: status,
          label: config.label,
          value: data.ordersByStatus[status] ?? 0,
          color: config.color === "gray" ? "gray.4" : `${config.color}.6`,
          href: access.orders ? `/admin/orders?status=${status}` : undefined,
        };
      })
    : undefined;
  return (
    <SectionCard title="Orders by Status" subtitle={formatRangeDates(range)} viewAllHref={access.orders ? "/admin/orders" : undefined}>
      <Box py={4}>
        <DonutWithLegend
          data={segments}
          loading={!data}
          totalLabel="Total Orders"
          size={164}
          thickness={22}
          emptyTitle="No orders in this period"
          emptyDescription="Status counts appear once orders come in."
        />
      </Box>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Recent orders
// ---------------------------------------------------------------------------

type RecentOrder = AdminDashboardSummary["recentOrders"][number];

function RecentOrdersCard({ data, access }: { data: AdminDashboardSummary | undefined; access: Access }) {
  const columns: ReportColumn<RecentOrder>[] = [
    {
      key: "rank",
      header: "#",
      width: 40,
      cell: (_order, index) => (
        <Text size="sm" c="var(--mo-color-text-secondary)" className="mo-tabular-nums">
          {index + 1}
        </Text>
      ),
      skeletonWidth: 12,
    },
    {
      key: "customer",
      header: "Customer",
      cell: (order, index) => {
        const tone = TONES[AVATAR_TONES[index % AVATAR_TONES.length] ?? "mint"];
        return (
          <Group gap="sm" wrap="nowrap">
            <Avatar
              radius="xl"
              size={34}
              styles={{ placeholder: { backgroundColor: tone.iconBg, color: tone.icon, fontSize: 12, fontWeight: 700 } }}
              aria-hidden
            >
              {initialsOf(order.customerName)}
            </Avatar>
            <Box style={{ minWidth: 0 }}>
              <Text className={classes.mono}>{order.orderNumber}</Text>
              <Text size="sm" fw={600} lineClamp={1}>
                {order.customerName}
              </Text>
            </Box>
          </Group>
        );
      },
      skeleton: (
        <Group gap="sm" wrap="nowrap">
          <Skeleton circle height={34} />
          <Box style={{ flex: 1 }}>
            <Skeleton height={9} width="55%" radius="xl" />
            <Skeleton height={11} width="75%" radius="xl" mt={7} />
          </Box>
        </Group>
      ),
    },
    {
      key: "products",
      header: "Products",
      cell: (order) => (
        <Group gap={8} wrap="nowrap">
          <Thumb src={order.firstItemImage} size={32} />
          <Text size="sm" c="var(--mo-color-text-secondary)" className={classes.nowrap}>
            {pluralize(order.itemCount, "item")}
          </Text>
        </Group>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (order) => (
        <Text size="sm" fw={600} className={classes.num}>
          {formatMoney(order.total)}
        </Text>
      ),
      minWidth: 84,
    },
    {
      key: "status",
      header: "Status",
      cell: (order) => <StatusBadge status={order.status} size="sm" withIcon={false} style={{ maxWidth: "none" }} />,
      skeletonWidth: 76,
      minWidth: 104,
    },
    {
      key: "date",
      header: "Date",
      cell: (order) => (
        <Text component="time" dateTime={order.createdAt} title={formatDhakaDateTime(order.createdAt)} fz={12} lh={1.45} c="var(--mo-color-text-secondary)" display="block" className={classes.nowrap}>
          {formatDhakaDate(order.createdAt)}
          <br />
          {formatDhakaTime(order.createdAt)}
        </Text>
      ),
    },
    ...(access.orders
      ? [
          {
            key: "action",
            header: "Action",
            align: "right" as const,
            cell: (order: RecentOrder) => (
              <Button
                component={Link}
                href={`/admin/orders?orderId=${encodeURIComponent(order.id)}`}
                size="compact-sm"
                radius="xl"
                variant="light"
                color="info"
                aria-label={`View order ${order.orderNumber}`}
              >
                View
              </Button>
            ),
            skeletonWidth: 52,
          },
        ]
      : []),
  ];

  return (
    <SectionCard
      title="Recent Orders"
      subtitle="Latest orders from your customers (all dates)"
      icon={<IconShoppingBag size={18} color="var(--mo-color-secondary-8)" aria-hidden />}
      viewAllHref={access.orders ? "/admin/orders" : undefined}
      flush
    >
      <ReportTable
        columns={columns}
        rows={data?.recentOrders}
        getRowKey={(order) => order.id}
        label="Recent orders"
        loading={!data}
        minWidth={640}
        emptyTitle="No orders yet"
        emptyDescription="New orders appear here as soon as customers check out."
        emptyIcon={<IconClipboardList stroke={1.6} />}
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Top products
// ---------------------------------------------------------------------------

function TopProductsCard({ data, range, access }: SectionProps & { access: Access }) {
  const items = data?.topProducts.map((product) => ({
    key: product.productId,
    title: product.title,
    subtitle: product.categoryName ?? product.sku,
    image: product.image,
    href: access.products ? `/admin/products?productId=${encodeURIComponent(product.productId)}` : undefined,
    units: product.unitsSold,
    amount: product.revenue,
  }));
  return (
    <SectionCard
      title="Top Selling Products"
      subtitle={`By revenue · ${formatRangeDates(range)}`}
      viewAllHref={`/admin/reports/products?${rangeQuery(range)}`}
    >
      <RankedProductList items={items} loading={!data} emptyTitle="No sales in this period" emptyDescription="Best sellers appear once orders come in." />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Latest customers
// ---------------------------------------------------------------------------

function LatestCustomersCard({ data, range, access }: SectionProps & { access: Access }) {
  const now = useNow(60_000);
  const customers = data?.latestCustomers.slice(0, 4);
  return (
    <SectionCard
      title="Latest Customers"
      viewAllHref={access.orders ? "/admin/customers" : `/admin/reports/customers?${rangeQuery(range)}`}
    >
      {!customers ? (
        <Box aria-hidden>
          {Array.from({ length: 4 }, (_, index) => (
            <Group key={index} gap="sm" wrap="nowrap" className={kitClasses.listRow}>
              <Skeleton circle height={32} />
              <Box style={{ flex: 1 }}>
                <Skeleton height={11} width="70%" radius="xl" />
                <Skeleton height={9} width="85%" radius="xl" mt={7} />
              </Box>
            </Group>
          ))}
        </Box>
      ) : customers.length === 0 ? (
        <EmptyState withCard={false} size="sm" icon={<IconUsersGroup stroke={1.6} />} color="secondaryGreen" title="No customers yet" description="New sign-ups appear here." />
      ) : (
        <Box component="ul" className={kitClasses.list}>
          {customers.map((customer, index) => {
            const tone = TONES[AVATAR_TONES[index % AVATAR_TONES.length] ?? "mint"];
            return (
              <li key={customer.id} className={kitClasses.listRow}>
                <Avatar
                  radius="xl"
                  size={32}
                  styles={{ placeholder: { backgroundColor: tone.iconBg, color: tone.icon, fontSize: 12, fontWeight: 700 } }}
                  aria-hidden
                >
                  {initialsOf(customer.fullName)}
                </Avatar>
                <Box style={{ flex: "1 1 auto", minWidth: 0 }}>
                  {access.orders ? (
                    <Text
                      component={Link}
                      href={`/admin/customers?customerId=${encodeURIComponent(customer.id)}`}
                      size="sm"
                      fw={600}
                      truncate
                      display="block"
                      className={kitClasses.cellLink}
                    >
                      {customer.fullName}
                    </Text>
                  ) : (
                    <Text size="sm" fw={600} truncate>
                      {customer.fullName}
                    </Text>
                  )}
                  <Text size="xs" c="var(--mo-color-text-muted)" truncate>
                    {customer.email ?? customer.phone}
                  </Text>
                </Box>
                <Text
                  component="time"
                  dateTime={customer.createdAt}
                  title={formatDhakaDateTime(customer.createdAt)}
                  size="xs"
                  c="var(--mo-color-text-muted)"
                  className={classes.nowrap}
                  style={{ flex: "0 0 auto" }}
                >
                  {formatRelativeTimeShort(customer.createdAt, now)}
                </Text>
              </li>
            );
          })}
        </Box>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Sales by category
// ---------------------------------------------------------------------------

function SalesByCategoryCard({ data, range }: SectionProps) {
  const items = data?.salesByCategory.slice(0, 5).map((category) => ({
    key: category.categoryId,
    label: category.name,
    percent: category.sharePercent,
  }));
  return (
    <SectionCard title="Sales by Category" subtitle="Share of product revenue" viewAllHref={`/admin/reports/products?${rangeQuery(range)}`}>
      <ProgressList items={items} loading={!data} labelWidth={96} emptyTitle="No category sales yet" emptyDescription="Shares appear once orders come in." />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

function RecentActivityCard() {
  const { data, error, isLoading, mutate } = useAdminActivity(5);
  return (
    <SectionCard title="Recent Activity" subtitle="Latest store events">
      {error && !data ? (
        <QueryError error={error} onRetry={() => void mutate()} compact title="Activity didn't load" />
      ) : (
        <ActivityFeed items={data} loading={isLoading} />
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

const SALES_ACTIONS: readonly QuickAction[] = [
  { key: "add-product", label: "Add Product", href: "/admin/products?new=1", icon: <IconPlus size={18} stroke={2} />, tone: "mint", permission: PERMISSIONS.PRODUCTS_WRITE },
  { key: "create-coupon", label: "Create Coupon", href: "/admin/discounts?new=coupon", icon: <IconDiscount size={18} stroke={2} />, tone: "rose", permission: PERMISSIONS.DISCOUNTS_MANAGE },
  { key: "view-orders", label: "View Orders", href: "/admin/orders", icon: <IconShoppingCart size={18} stroke={2} />, tone: "sky", permission: PERMISSIONS.ORDERS_READ },
  { key: "customers", label: "Manage Customers", href: "/admin/customers", icon: <IconUsers size={18} stroke={2} />, tone: "lavender", permission: PERMISSIONS.ORDERS_READ },
];
