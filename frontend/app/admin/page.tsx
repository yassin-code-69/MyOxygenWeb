"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Anchor,
  Badge,
  Box,
  Card,
  Grid,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCash,
  IconPackage,
  IconReceipt2,
  IconShoppingCart,
  IconTrendingDown,
  IconTrendingUp,
} from "@tabler/icons-react";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import { AdminPageSkeleton } from "../../components/admin/AdminScreens";
import { DateRangeFilter, isCompleteRange, type DateRange } from "../../components/admin/DateRangeFilter";
import { ForbiddenPanel } from "../../components/admin/ForbiddenPanel";
import { KpiCard } from "../../components/admin/KpiCard";
import { MeterBar } from "../../components/admin/MeterBar";
import { PageHeader } from "../../components/admin/PageHeader";
import { QueryError } from "../../components/admin/QueryError";
import { RevenueChart } from "../../components/admin/RevenueChart";
import {
  formatCalendarDate,
  formatCount,
  formatDhakaDateTime,
  formatMoney,
} from "../../components/admin/format";
import { useCan } from "../../hooks/admin/use-permission";
import { useTelemetry } from "../../hooks/admin/use-telemetry";
import { getAdminHomeHref } from "../../lib/admin-nav";
import { useAuthStore } from "../../lib/auth-store";
import { PERMISSIONS } from "../../types/auth";
import { ADMIN_ORDER_STATUSES, type AdminTelemetrySummary } from "../../types/admin";

const MAX_RANGE_DAYS = 366;

function daysInRange([from, to]: DateRange): number {
  if (!from || !to) {
    return 0;
  }
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** `/admin` — landing page for roles with ANALYTICS_READ; others are sent to their first allowed page. */
export default function AdminDashboardPage() {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role ?? null);
  const canAnalytics = useCan(PERMISSIONS.ANALYTICS_READ);
  const homeHref = getAdminHomeHref(role);
  const redirectTo = !canAnalytics && homeHref && homeHref !== "/admin" ? homeHref : null;

  useEffect(() => {
    if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router]);

  if (redirectTo) {
    return <AdminPageSkeleton />;
  }
  if (!canAnalytics) {
    return <ForbiddenPanel permission={PERMISSIONS.ANALYTICS_READ} />;
  }
  return <DashboardView />;
}

function TrendBadge({ percent }: { percent: number | null }) {
  if (percent === null) {
    return null;
  }
  const up = percent >= 0;
  const Icon = up ? IconTrendingUp : IconTrendingDown;
  return (
    <Tooltip label="Revenue of the last 30 days compared with the 30 days before">
      <Badge
        variant="light"
        color={up ? "success" : "danger"}
        leftSection={<Icon size={12} aria-hidden />}
        className="mo-tabular-nums"
        aria-label={`${up ? "Up" : "Down"} ${Math.abs(percent)}% versus the previous 30 days`}
      >
        {up ? "+" : "−"}
        {Math.abs(percent)}%
      </Badge>
    </Tooltip>
  );
}

function DashboardView() {
  const [range, setRange] = useState<DateRange>([null, null]);
  const [appliedRange, setAppliedRange] = useState<DateRange>([null, null]);
  const rangeDays = daysInRange(appliedRange);
  const { data, error, isLoading, isValidating, mutate } = useTelemetry({ from: appliedRange[0], to: appliedRange[1] });
  const canOrders = useCan(PERMISSIONS.ORDERS_READ);
  const canProducts = useCan(PERMISSIONS.PRODUCTS_READ);
  const canBatches = useCan(PERMISSIONS.BATCHES_MANAGE);
  const rangeTooLong = daysInRange(range) > MAX_RANGE_DAYS;

  const handleRangeChange = (next: DateRange) => {
    setRange(next);
    if (isCompleteRange(next) && daysInRange(next) <= MAX_RANGE_DAYS) {
      setAppliedRange(next);
    }
  };

  const periodLabel =
    appliedRange[0] && appliedRange[1]
      ? `${formatCalendarDate(appliedRange[0])} – ${formatCalendarDate(appliedRange[1])}`
      : "Last 30 days";
  const totalsLabel = appliedRange[0] ? `${formatCount(rangeDays)}-day range` : "All time";
  const loading = isLoading && !data;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Dashboard"
        description="Sales and stock at a glance. Revenue excludes cancelled and refunded orders and includes delivery fees. Times are in Dhaka (GMT+6)."
        actions={
          <Box>
            <DateRangeFilter value={range} onChange={handleRangeChange} placeholder="All time" width={280} />
            {rangeTooLong ? (
              <Text size="xs" c="var(--mantine-color-error)" mt={4}>
                Pick a range of {MAX_RANGE_DAYS} days or less.
              </Text>
            ) : null}
          </Box>
        }
      />

      {error && !data ? <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.ANALYTICS_READ} /> : null}

      <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 5 }} spacing="md">
        <KpiCard
          label="Revenue"
          value={data ? formatMoney(data.totalRevenue) : "—"}
          icon={<IconCash size={18} />}
          color="primaryPink"
          badge={data ? <TrendBadge percent={data.revenueTrendPercent} /> : null}
          hint={data ? `${totalsLabel} · from ${formatCount(data.revenueOrderCount)} orders` : totalsLabel}
          loading={loading}
        />
        <KpiCard
          label="Orders"
          value={data ? formatCount(data.totalOrders) : "—"}
          icon={<IconShoppingCart size={18} />}
          color="info"
          hint={totalsLabel}
          href={canOrders ? "/admin/orders" : undefined}
          linkLabel="View orders"
          loading={loading}
        />
        <KpiCard
          label="Average order"
          value={data ? formatMoney(data.avgOrderValue) : "—"}
          icon={<IconReceipt2 size={18} />}
          color="accentPurple"
          hint="Revenue ÷ revenue orders"
          loading={loading}
        />
        <KpiCard
          label="Low stock"
          value={data ? formatCount(data.lowStockCount) : "—"}
          icon={<IconPackage size={18} />}
          color="warning"
          hint="At or below their alert level"
          href={canProducts ? "/admin/products?stock=low" : undefined}
          linkLabel="Review"
          loading={loading}
        />
        <KpiCard
          label="Expiring soon"
          value={data ? formatCount(data.expiringSoonCount) : "—"}
          icon={<IconAlertTriangle size={18} />}
          color="danger"
          hint="Batches with stock, ≤ 30 days left"
          href={canBatches ? "/admin/batches?status=EXPIRING_SOON" : undefined}
          linkLabel="Inspect"
          loading={loading}
        />
      </SimpleGrid>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <RevenueChart data={data?.dailyRevenue} loading={loading || (isValidating && !data)} periodLabel={periodLabel} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <OrdersByStatusCard data={data} loading={loading} canOrders={canOrders} label={totalsLabel} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <RecentOrdersCard data={data} loading={loading} canOrders={canOrders} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <TopProductsCard data={data} loading={loading} canProducts={canProducts} label={totalsLabel} />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

interface CardProps {
  data: AdminTelemetrySummary | undefined;
  loading: boolean;
}

function OrdersByStatusCard({ data, loading, canOrders, label }: CardProps & { canOrders: boolean; label: string }) {
  const total = data ? ADMIN_ORDER_STATUSES.reduce((sum, status) => sum + (data.ordersByStatus[status] ?? 0), 0) : 0;
  return (
    <Card withBorder padding="lg" h="100%">
      <Text fw={700} ff="var(--mo-font-heading)">
        Orders by status
      </Text>
      <Text size="xs" c="dimmed" mb="md">
        {label} · {formatCount(total)} orders
      </Text>
      <Stack gap="sm">
        {ADMIN_ORDER_STATUSES.map((status) => {
          const count = data?.ordersByStatus[status] ?? 0;
          return (
            <Box key={status}>
              <Group justify="space-between" mb={4} wrap="nowrap">
                {canOrders ? (
                  <Anchor component={Link} href={`/admin/orders?status=${status}`} underline="never" aria-label={`View ${status.toLowerCase()} orders`}>
                    <StatusBadge status={status} size="sm" />
                  </Anchor>
                ) : (
                  <StatusBadge status={status} size="sm" />
                )}
                {loading ? (
                  <Skeleton height={12} width={36} radius="xl" />
                ) : (
                  <Text size="sm" fw={600} className="mo-tabular-nums">
                    {formatCount(count)}
                  </Text>
                )}
              </Group>
              <MeterBar ratio={total > 0 ? count / total : 0} color="gray" height={6} />
            </Box>
          );
        })}
      </Stack>
    </Card>
  );
}

function RecentOrdersCard({ data, loading, canOrders }: CardProps & { canOrders: boolean }) {
  return (
    <Card withBorder padding="lg" h="100%">
      <Group justify="space-between" mb="sm">
        <Box>
          <Text fw={700} ff="var(--mo-font-heading)">
            Recent orders
          </Text>
          <Text size="xs" c="dimmed">
            The five newest orders
          </Text>
        </Box>
        {canOrders ? (
          <Anchor component={Link} href="/admin/orders" size="sm" fw={600}>
            All orders
          </Anchor>
        ) : null}
      </Group>
      {loading ? (
        <Stack gap="sm">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} height={36} radius="md" />
          ))}
        </Stack>
      ) : null}
      {data && data.recentOrders.length === 0 ? (
        <EmptyState withCard={false} size="sm" title="No orders yet" description="New orders appear here as soon as customers check out." />
      ) : null}
      {data && data.recentOrders.length > 0 ? (
        <Table.ScrollContainer minWidth={520} type="native">
          <Table verticalSpacing="xs" aria-label="Recent orders">
            <Table.Thead>
              <Table.Tr>
                <Table.Th scope="col">Order</Table.Th>
                <Table.Th scope="col">Customer</Table.Th>
                <Table.Th scope="col">Status</Table.Th>
                <Table.Th scope="col" ta="right">
                  Total
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.recentOrders.map((order) => (
                <Table.Tr key={order.id}>
                  <Table.Td>
                    {canOrders ? (
                      <Anchor component={Link} href={`/admin/orders?q=${encodeURIComponent(order.orderNumber)}`} size="sm" fw={600} ff="var(--mo-font-monospace)">
                        {order.orderNumber}
                      </Anchor>
                    ) : (
                      <Text size="sm" fw={600} ff="var(--mo-font-monospace)">
                        {order.orderNumber}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed">
                      {formatDhakaDateTime(order.createdAt)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{order.customerName}</Text>
                    <Text size="xs" c="dimmed">
                      {order.customerPhone} · {formatCount(order.itemCount)} {order.itemCount === 1 ? "item" : "items"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge status={order.status} size="sm" />
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" fw={600} className="mo-tabular-nums">
                      {formatMoney(order.total)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : null}
    </Card>
  );
}

function TopProductsCard({ data, loading, canProducts, label }: CardProps & { canProducts: boolean; label: string }) {
  const topRevenue = data?.topProducts[0]?.revenue ?? 0;
  return (
    <Card withBorder padding="lg" h="100%">
      <Text fw={700} ff="var(--mo-font-heading)">
        Top products
      </Text>
      <Text size="xs" c="dimmed" mb="md">
        {label} · by revenue
      </Text>
      {loading ? (
        <Stack gap="md">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} height={40} radius="md" />
          ))}
        </Stack>
      ) : null}
      {data && data.topProducts.length === 0 ? (
        <EmptyState withCard={false} size="sm" title="No sales yet" description="Best sellers appear once orders come in for this period." />
      ) : null}
      {data && data.topProducts.length > 0 ? (
        <Stack gap="md" component="ol" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {data.topProducts.map((product, index) => (
            <Box component="li" key={product.productId}>
              <Group justify="space-between" wrap="nowrap" gap="sm" mb={4}>
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Badge variant="light" color="gray" size="sm" circle>
                    {index + 1}
                  </Badge>
                  <Box style={{ minWidth: 0 }}>
                    {canProducts ? (
                      <Anchor component={Link} href={`/admin/products?q=${encodeURIComponent(product.sku)}`} size="sm" fw={600} lineClamp={1}>
                        {product.title}
                      </Anchor>
                    ) : (
                      <Text size="sm" fw={600} lineClamp={1}>
                        {product.title}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed">
                      {product.sku} · {formatCount(product.unitsSold)} sold
                    </Text>
                  </Box>
                </Group>
                <Text size="sm" fw={600} className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
                  {formatMoney(product.revenue)}
                </Text>
              </Group>
              <MeterBar ratio={topRevenue > 0 ? product.revenue / topRevenue : 0} color="secondaryGreen" height={6} />
            </Box>
          ))}
        </Stack>
      ) : null}
    </Card>
  );
}
