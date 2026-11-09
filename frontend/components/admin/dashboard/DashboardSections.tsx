"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, Badge, Box, Grid, Group, Select, Skeleton, Table, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCash,
  IconClipboardList,
  IconDiscount,
  IconPackage,
  IconPackages,
  IconPlus,
  IconShoppingCart,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import { EmptyState } from "../../EmptyState";
import { STATUS_CONFIG, StatusBadge } from "../../StatusBadge";
import { PERMISSIONS } from "../../../types/auth";
import { ADMIN_ORDER_STATUSES } from "../../../types/admin";
import type { AdminDashboardSummary, AdminDateRange } from "../../../types/admin-dashboard";
import {
  AreaTrendChart,
  ChartViewToggle,
  DonutWithLegend,
  KpiCard,
  ProgressList,
  QuickActions,
  RankedProductList,
  SectionCard,
  Thumb,
  TONES,
  previousPeriodCaption,
  type ChartView,
  type KpiTone,
  type QuickAction,
} from "../kit";
import { useNow } from "../kit/use-now";
import {
  formatCount,
  formatDhakaDate,
  formatDhakaDateTime,
  formatDhakaTime,
  formatMoney,
  formatRelativeTimeShort,
  initialsOf,
  pluralize,
} from "../format";
import classes from "./dashboard.module.css";
import kitClasses from "../kit/kit.module.css";

/** What each section may link to, resolved once from the user's permissions. */
export interface DashboardAccess {
  orders: boolean;
  products: boolean;
  batches: boolean;
}

/** Container-query breakpoints: columns follow the content width, not the viewport (the sidebar takes 260px). */
export const DASHBOARD_GRID_BREAKPOINTS = { xs: "480px", sm: "640px", md: "760px", lg: "940px", xl: "1100px" };

interface SectionProps {
  data: AdminDashboardSummary | undefined;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// KPI row
// ---------------------------------------------------------------------------

export function DashboardKpis({ data, loading, range }: SectionProps & { range: AdminDateRange }) {
  const caption = previousPeriodCaption(range);
  return (
    <Grid type="container" breakpoints={DASHBOARD_GRID_BREAKPOINTS} gap="md">
      <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
        <KpiCard
          tone="lavender"
          icon={<IconShoppingCart size={24} stroke={1.8} />}
          label="Total Orders"
          kpi={data?.kpis.orders}
          format="count"
          trendCaption={caption}
          hint="Orders placed in the last 7 days"
          loading={loading}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
        <KpiCard
          tone="sky"
          icon={<IconUsers size={24} stroke={1.8} />}
          label="Total Customers"
          kpi={data?.kpis.customers}
          format="count"
          trendCaption={caption}
          hint="Registered customer accounts"
          loading={loading}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
        <KpiCard
          tone="mint"
          icon={<IconCash size={24} stroke={1.8} />}
          label="Total Revenue"
          kpi={data?.kpis.revenue}
          format="currency"
          trendCaption={caption}
          hint="Excludes cancelled and refunded orders"
          loading={loading}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
        <KpiCard
          tone="peach"
          icon={<IconPackage size={24} stroke={1.8} />}
          label="Low Stock Products"
          value={data ? formatCount(data.lowStockCount) : undefined}
          href="/admin/reports/inventory"
          linkLabel="View Details"
          loading={loading}
        />
      </Grid.Col>
    </Grid>
  );
}

// ---------------------------------------------------------------------------
// Sales overview
// ---------------------------------------------------------------------------

type SalesMetric = "revenue" | "orders";

export function SalesOverviewCard({ data, loading, periodLabel }: SectionProps & { periodLabel: string }) {
  const [metric, setMetric] = useState<SalesMetric>("revenue");
  const [view, setView] = useState<ChartView>("chart");
  const points = data?.revenueSeries.map((point) => ({
    label: point.label,
    period: point.period,
    value: metric === "revenue" ? point.revenue : point.orders,
  }));
  return (
    <SectionCard
      title="Sales Overview"
      subtitle={periodLabel}
      viewAllHref="/admin/reports/sales"
      viewAllLabel="Full report"
      actions={
        <>
          <Select
            size="xs"
            radius="xl"
            w={116}
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
        loading={loading}
        seriesLabel={metric === "revenue" ? "Revenue" : "Orders"}
        format={metric === "revenue" ? "currency" : "count"}
        view={view}
        periodLabel={periodLabel.toLowerCase()}
        height={270}
        emptyTitle={metric === "revenue" ? "No revenue in the last 7 days" : "No orders in the last 7 days"}
        emptyDescription="Sales appear here as soon as customers check out."
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Orders by status
// ---------------------------------------------------------------------------

export function OrdersByStatusCard({ data, loading, access, periodLabel }: SectionProps & { access: DashboardAccess; periodLabel: string }) {
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
    <SectionCard title="Orders by Status" subtitle={periodLabel} viewAllHref={access.orders ? "/admin/orders" : undefined}>
      <Box py={4}>
        <DonutWithLegend
          data={segments}
          loading={loading}
          totalLabel="Total Orders"
          size={156}
          thickness={22}
          emptyTitle="No orders in the last 7 days"
          emptyDescription="Status counts appear once orders come in."
        />
      </Box>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Recent orders
// ---------------------------------------------------------------------------

export function RecentOrdersCard({ data, loading, access }: SectionProps & { access: DashboardAccess }) {
  const orders = data?.recentOrders;
  const skeleton = (
    <Box px="lg" pb="md" aria-hidden>
      {Array.from({ length: 5 }, (_, index) => (
        <Group key={index} gap="md" wrap="nowrap" h={60} style={{ borderBottom: "1px solid var(--mo-color-border-subtle)" }}>
          <Skeleton height={12} width={12} radius="xl" />
          <Box style={{ flex: 1 }}>
            <Skeleton height={10} width="45%" radius="xl" />
            <Skeleton height={12} width="65%" radius="xl" mt={8} />
          </Box>
          <Skeleton height={36} width={36} radius="sm" />
          <Skeleton height={12} width={64} radius="xl" />
          <Skeleton height={20} width={76} radius="xl" />
        </Group>
      ))}
    </Box>
  );

  return (
    <SectionCard title="Recent Orders" subtitle="The five newest orders" viewAllHref={access.orders ? "/admin/orders" : undefined} flush loading={loading && !data} skeleton={skeleton}>
      {orders && orders.length === 0 ? (
        <EmptyState withCard={false} size="sm" icon={<IconClipboardList stroke={1.6} />} color="secondaryGreen" title="No orders yet" description="New orders appear here as soon as customers check out." />
      ) : null}
      {orders && orders.length > 0 ? (
        <div className={classes.tableFrame}>
          <Table.ScrollContainer minWidth={300} type="native">
            <Table className={classes.table} verticalSpacing={10} horizontalSpacing={12} highlightOnHover aria-label="Recent orders">
              <Table.Thead bg="var(--mo-color-surface-muted)">
                <Table.Tr>
                  <Table.Th scope="col" w={32} pl="lg" className={classes.wideOnly}>
                    #
                  </Table.Th>
                  <Table.Th scope="col">Customer</Table.Th>
                  <Table.Th scope="col" className={classes.midOnly}>
                    Products
                  </Table.Th>
                  <Table.Th scope="col" ta="right">
                    Amount
                  </Table.Th>
                  <Table.Th scope="col">Status</Table.Th>
                  <Table.Th scope="col" pr="lg" className={classes.midOnly}>
                    Date
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {orders.map((order, index) => (
                  <Table.Tr key={order.id}>
                    <Table.Td pl="lg" className={classes.wideOnly}>
                      <Text size="sm" c="var(--mo-color-text-secondary)" className="mo-tabular-nums">
                        {index + 1}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {access.orders ? (
                        <Link href={`/admin/orders?orderId=${encodeURIComponent(order.id)}`} className={classes.orderLink} aria-label={`Open order ${order.orderNumber}`}>
                          {order.orderNumber}
                        </Link>
                      ) : (
                        <span className={classes.orderLink}>{order.orderNumber}</span>
                      )}
                      <Text fz={13} fw={600} c="var(--mo-color-text)" lineClamp={1}>
                        {order.customerName}
                      </Text>
                    </Table.Td>
                    <Table.Td className={classes.midOnly}>
                      <Group gap={8} wrap="nowrap">
                        <Thumb src={order.firstItemImage} size={34} />
                        <Text fz={13} c="var(--mo-color-text-secondary)" style={{ whiteSpace: "nowrap" }}>
                          {pluralize(order.itemCount, "item")}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz={13} fw={600} c="var(--mo-color-text)" className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
                        {formatMoney(order.total)}
                      </Text>
                    </Table.Td>
                    <Table.Td miw={104}>
                      <StatusBadge status={order.status} size="sm" withIcon={false} style={{ maxWidth: "none" }} />
                    </Table.Td>
                    <Table.Td pr="lg" className={classes.midOnly}>
                      <Text component="time" dateTime={order.createdAt} title={formatDhakaDateTime(order.createdAt)} fz={12} lh={1.45} c="var(--mo-color-text-secondary)" display="block" style={{ whiteSpace: "nowrap" }}>
                        {formatDhakaDate(order.createdAt)}
                        <br />
                        {formatDhakaTime(order.createdAt)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </div>
      ) : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Top selling products
// ---------------------------------------------------------------------------

export function TopProductsCard({ data, loading, access }: SectionProps & { access: DashboardAccess }) {
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
    <SectionCard title="Top Selling Products" subtitle="By revenue, last 7 days" viewAllHref="/admin/reports/products">
      <RankedProductList items={items} loading={loading} emptyTitle="No sales in the last 7 days" emptyDescription="Best sellers appear once orders come in." />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Latest customers
// ---------------------------------------------------------------------------

const AVATAR_TONES: readonly KpiTone[] = ["lavender", "sky", "mint", "peach", "rose"];

export function LatestCustomersCard({ data, loading, access }: SectionProps & { access: DashboardAccess }) {
  const now = useNow(60_000);
  const customers = data?.latestCustomers;
  return (
    <SectionCard title="Latest Customers" viewAllHref={access.orders ? "/admin/customers" : undefined}>
      {loading && !customers ? (
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
      ) : null}
      {customers && customers.length === 0 ? (
        <EmptyState withCard={false} size="sm" icon={<IconUsersGroup stroke={1.6} />} color="secondaryGreen" title="No customers yet" description="New sign-ups appear here." />
      ) : null}
      {customers && customers.length > 0 ? (
        <Box component="ul" className={kitClasses.list}>
          {customers.map((customer, index) => {
            const tone = TONES[AVATAR_TONES[index % AVATAR_TONES.length] ?? "mint"];
            return (
              <li key={customer.id} className={kitClasses.listRow} style={{ minHeight: 52 }}>
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
                    <Text component={Link} href={`/admin/customers?customerId=${encodeURIComponent(customer.id)}`} size="sm" fw={600} truncate display="block" className={kitClasses.cellLink}>
                      {customer.fullName}
                    </Text>
                  ) : (
                    <Text size="sm" fw={600} truncate c="var(--mo-color-text)">
                      {customer.fullName}
                    </Text>
                  )}
                  <Text size="xs" c="var(--mo-color-text-muted)" truncate>
                    {customer.email ?? customer.phone}
                  </Text>
                </Box>
                <Text component="time" dateTime={customer.createdAt} title={formatDhakaDateTime(customer.createdAt)} size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}>
                  {formatRelativeTimeShort(customer.createdAt, now)}
                </Text>
              </li>
            );
          })}
        </Box>
      ) : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Top categories
// ---------------------------------------------------------------------------

export function TopCategoriesCard({ data, loading }: SectionProps) {
  const items = data?.salesByCategory.slice(0, 5).map((category) => ({
    key: category.categoryId,
    label: category.name,
    percent: category.sharePercent,
  }));
  return (
    <SectionCard title="Top Categories" subtitle="Share of revenue" viewAllHref="/admin/reports/sales">
      <ProgressList items={items} loading={loading} labelWidth={96} emptyTitle="No category sales yet" emptyDescription="Shares appear once orders come in." />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Inventory alerts
// ---------------------------------------------------------------------------

export function InventoryAlertsCard({ data, loading, access }: SectionProps & { access: DashboardAccess }) {
  const products = data?.lowStockProducts;
  return (
    <SectionCard title="Inventory Alerts" viewAllHref="/admin/reports/inventory">
      {loading && !products ? (
        <Box aria-hidden>
          {Array.from({ length: 4 }, (_, index) => (
            <Group key={index} gap="sm" wrap="nowrap" className={kitClasses.listRow} style={{ minHeight: 48 }}>
              <Skeleton height={32} width={32} radius="sm" />
              <Skeleton height={11} radius="xl" style={{ flex: 1 }} />
              <Skeleton height={18} width={52} radius="xl" />
            </Group>
          ))}
        </Box>
      ) : null}
      {products && products.length === 0 ? (
        <EmptyState withCard={false} size="sm" icon={<IconPackages stroke={1.6} />} color="secondaryGreen" title="Stock looks healthy" description="No product is at or below its alert level." />
      ) : null}
      {products && products.length > 0 ? (
        <Box component="ul" className={kitClasses.list}>
          {products.map((product) => {
            const out = product.totalStock <= 0;
            const critical = product.totalStock <= Math.ceil(product.lowStockThreshold / 2);
            return (
              <li key={product.productId} className={kitClasses.listRow} style={{ minHeight: 48 }}>
                <Thumb src={product.image} size={32} />
                <Box style={{ flex: "1 1 auto", minWidth: 0 }}>
                  {access.batches ? (
                    <Text component={Link} href={`/admin/batches?productId=${encodeURIComponent(product.productId)}`} size="xs" fw={500} lineClamp={1} className={kitClasses.cellLink}>
                      {product.title}
                    </Text>
                  ) : (
                    <Text size="xs" fw={500} lineClamp={1} c="var(--mo-color-text)">
                      {product.title}
                    </Text>
                  )}
                </Box>
                <Badge
                  size="sm"
                  radius="xl"
                  variant="light"
                  color={out || critical ? "danger" : "warning"}
                  tt="none"
                  fw={700}
                  className="mo-tabular-nums"
                  style={{ flex: "0 0 auto" }}
                  leftSection={out ? <IconAlertTriangle size={11} aria-hidden /> : undefined}
                >
                  {out ? "Out of stock" : `${formatCount(product.totalStock)} left`}
                </Badge>
              </li>
            );
          })}
        </Box>
      ) : null}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

const DASHBOARD_ACTIONS: readonly QuickAction[] = [
  { key: "add-product", label: "Add Product", href: "/admin/products?new=1", icon: <IconPlus size={18} stroke={2} />, tone: "mint", permission: PERMISSIONS.PRODUCTS_WRITE },
  { key: "create-coupon", label: "Create Coupon", href: "/admin/discounts?new=coupon", icon: <IconDiscount size={18} stroke={2} />, tone: "rose", permission: PERMISSIONS.DISCOUNTS_MANAGE },
  { key: "view-orders", label: "View Orders", href: "/admin/orders", icon: <IconShoppingCart size={18} stroke={2} />, tone: "sky", permission: PERMISSIONS.ORDERS_READ },
  { key: "customers", label: "Manage Customers", href: "/admin/customers", icon: <IconUsers size={18} stroke={2} />, tone: "lavender", permission: PERMISSIONS.ORDERS_READ },
];

export function QuickActionsCard() {
  return (
    <SectionCard title="Quick Actions">
      <QuickActions actions={DASHBOARD_ACTIONS} cols={2} />
    </SectionCard>
  );
}
