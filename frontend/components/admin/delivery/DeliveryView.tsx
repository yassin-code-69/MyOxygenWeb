"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Box,
  Button,
  CloseButton,
  Grid,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import {
  IconCircleCheck,
  IconClockHour4,
  IconMapPin,
  IconPackageExport,
  IconRoute,
  IconSearch,
  IconTruckDelivery,
  IconTruckOff,
} from "@tabler/icons-react";
import { Price } from "../../Price";
import { StatusBadge } from "../../StatusBadge";
import {
  DELIVERY_QUEUES,
  useDeliveryOrders,
  useDeliverySummary,
  type DeliveryQueue,
} from "../../../hooks/admin/use-delivery";
import { useCan } from "../../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../../types/auth";
import type { AdminOrderDTO } from "../../../types/admin";
import { DataTable, type DataTableColumn } from "../DataTable";
import { FilterBar } from "../FilterBar";
import { QueryError } from "../QueryError";
import { formatCount, formatDhakaDate, paymentMethodLabel } from "../format";
import { DateRangePicker, KpiCard, PageHeader, SectionCard, formatRangeDates } from "../kit";
import { MANAGEMENT_GRID_BREAKPOINTS } from "../customers/CustomerKpis";
import { readEnum, readPositiveInt, useUrlDateRange, useUrlParams } from "../payments/url-state";
import { CourierBreakdown } from "./CourierBreakdown";
import { ShipmentTrackingDrawer } from "./ShipmentTrackingDrawer";
import { courierLabel, daysBetween, formatDayCount, formatDeliveryHours } from "./delivery-utils";
import classes from "./delivery.module.css";

const DEFAULT_LIMIT = 20;

const QUEUE_LABELS: Record<DeliveryQueue, string> = {
  ready: "Ready to ship",
  transit: "In transit",
  delivered: "Delivered",
};

/**
 * `/admin/delivery` (ORDERS_READ). URL state: `?range` / `?from&to`
 * (default last 30 days), `?queue=ready|transit|delivered`, `?q`, `?page`,
 * `?track=<orderId>` (opens the tracking drawer).
 */
export function DeliveryView() {
  const { searchParams, setParams } = useUrlParams();
  const [range, setRange] = useUrlDateRange("last30");
  const canAssign = useCan(PERMISSIONS.COURIER_ASSIGN);

  const queue = readEnum(searchParams.get("queue"), DELIVERY_QUEUES, "ready");
  const q = searchParams.get("q") ?? "";
  const page = readPositiveInt(searchParams.get("page"), 1);
  const limit = readPositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, 100);
  const trackId = searchParams.get("track");

  const [search, setSearch] = useState(q);
  const pushSearch = useDebouncedCallback((value: string) => setParams({ q: value.trim(), page: null }), 300);

  const summary = useDeliverySummary(range);
  const list = useDeliveryOrders({ queue, page, limit, q, range });
  const s = summary.data;
  const summaryLoading = summary.isLoading && !s;
  const rangeText = formatRangeDates(range);

  const timingColumn: DataTableColumn<AdminOrderDTO> =
    queue === "ready"
      ? {
          key: "waiting",
          header: "Waiting",
          width: 150,
          skeletonWidth: 90,
          cell: (order) => {
            const days = daysBetween(order.createdAt, new Date()) ?? 0;
            return (
              <Box>
                <Text size="sm" fw={600} c={days >= 2 ? "var(--mo-color-text-warning)" : "var(--mo-color-text)"}>
                  {formatDayCount(days)}
                </Text>
                <Text size="xs" c="var(--mo-color-text-muted)">
                  since {formatDhakaDate(order.createdAt)}
                </Text>
              </Box>
            );
          },
        }
      : queue === "transit"
        ? {
            key: "shipped",
            header: "Shipped",
            width: 150,
            skeletonWidth: 90,
            cell: (order) => {
              const days = daysBetween(order.shippedAt, new Date());
              return (
                <Box>
                  <Text size="sm" fw={600}>
                    {formatDhakaDate(order.shippedAt)}
                  </Text>
                  <Text size="xs" c={days !== null && days >= 4 ? "var(--mo-color-text-warning)" : "var(--mo-color-text-muted)"}>
                    {days !== null ? `${formatDayCount(days)} in transit` : "—"}
                  </Text>
                </Box>
              );
            },
          }
        : {
            key: "delivered",
            header: "Delivered",
            width: 150,
            skeletonWidth: 90,
            cell: (order) => {
              const days = daysBetween(order.shippedAt, order.deliveredAt);
              return (
                <Box>
                  <Text size="sm" fw={600}>
                    {formatDhakaDate(order.deliveredAt)}
                  </Text>
                  <Text size="xs" c="var(--mo-color-text-muted)">
                    {days !== null ? `took ${formatDayCount(days)}` : "—"}
                  </Text>
                </Box>
              );
            },
          };

  const columns: DataTableColumn<AdminOrderDTO>[] = [
    {
      key: "order",
      header: "Order",
      width: 210,
      skeletonWidth: "85%",
      cell: (order) => (
        <Box>
          <Link href={`/admin/orders?orderId=${encodeURIComponent(order.id)}`} className={classes.orderLink} aria-label={`Open order ${order.orderNumber}`}>
            {order.orderNumber}
          </Link>
          <Text size="xs" c="var(--mo-color-text-muted)">
            Placed {formatDhakaDate(order.createdAt)}
          </Text>
        </Box>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      skeletonWidth: "75%",
      cell: (order) => (
        <Box style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} truncate maw={200}>
            {order.customer.fullName}
          </Text>
          <Group gap={4} wrap="nowrap" c="var(--mo-color-text-muted)">
            <IconMapPin size={12} aria-hidden />
            <Text size="xs" c="var(--mo-color-text-muted)" truncate maw={180}>
              {order.shippingAddress.city}, {order.shippingAddress.district}
            </Text>
          </Group>
        </Box>
      ),
    },
    {
      key: "courier",
      header: "Courier",
      width: 190,
      skeletonWidth: "70%",
      cell: (order) =>
        order.courierProvider || order.trackingId ? (
          <Box>
            <Text size="sm">{courierLabel(order.courierProvider)}</Text>
            <Text size="xs" c="var(--mo-color-text-muted)" ff="var(--mo-font-monospace)">
              {order.trackingId ?? "No tracking ID"}
            </Text>
          </Box>
        ) : (
          <Text size="sm" c="var(--mo-color-text-subtle)">
            Not dispatched yet
          </Text>
        ),
    },
    timingColumn,
    {
      key: "amount",
      header: "Amount",
      align: "right",
      width: 150,
      skeletonWidth: 70,
      cell: (order) => (
        <Stack gap={4} align="flex-end">
          <Price value={order.total} size="sm" fw={600} />
          <Group gap={4} wrap="nowrap" justify="flex-end">
            <Text size="xs" c="var(--mo-color-text-muted)">
              {order.paymentMethod === "COD" ? "COD" : paymentMethodLabel(order.paymentMethod)}
            </Text>
            <StatusBadge status={order.paymentStatus} size="xs" withIcon={false} />
          </Group>
        </Stack>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 110,
      skeletonWidth: 60,
      cell: (order) => (
        <Button
          size="compact-sm"
          variant="light"
          color="secondaryGreen"
          radius="xl"
          leftSection={<IconRoute size={14} aria-hidden />}
          onClick={() => setParams({ track: order.id })}
          aria-label={`Track ${order.orderNumber}`}
        >
          Track
        </Button>
      ),
    },
  ];

  const queueCount = (value: DeliveryQueue): number | null => {
    if (value === queue && list.data) {
      return list.data.meta.total;
    }
    if (!s) {
      return null;
    }
    if (value === "ready") {
      return s.readyToShip;
    }
    if (value === "transit") {
      return s.inTransit;
    }
    return null;
  };

  const emptyCopy: Record<DeliveryQueue, { title: string; description: string }> = {
    ready: {
      title: q ? "No packed orders match your search" : "Nothing waiting to ship",
      description: "Orders show up here once they are accepted (Processing).",
    },
    transit: {
      title: q ? "No parcels match your search" : "No parcels on the road",
      description: "Shipped orders stay here until they are marked delivered.",
    },
    delivered: {
      title: q ? "No deliveries match your search" : "No delivered orders in this period",
      description: "This list shows orders delivered in the selected period.",
    },
  };

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconTruckDelivery size={20} />}
        title="Delivery & Tracking"
        subtitle="What needs to ship, what is on the road and how fast parcels arrive."
        mb={0}
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      {summary.error && !s ? (
        <QueryError error={summary.error} onRetry={() => void summary.mutate()} permission={PERMISSIONS.ORDERS_READ} title="We couldn't load the delivery figures" />
      ) : (
        <Grid type="container" breakpoints={MANAGEMENT_GRID_BREAKPOINTS} columns={10} gap="md">
          <Grid.Col span={{ base: 10, xs: 5, lg: 2 }}>
            <KpiCard
              tone="sky"
              icon={<IconPackageExport size={24} stroke={1.8} />}
              label="Ready to Ship"
              value={s ? formatCount(s.readyToShip) : undefined}
              hint="Right now · packed, waiting for courier"
              loading={summaryLoading}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 10, xs: 5, lg: 2 }}>
            <KpiCard
              tone="lavender"
              icon={<IconTruckDelivery size={24} stroke={1.8} />}
              label="In Transit"
              value={s ? formatCount(s.inTransit) : undefined}
              hint="Right now · with the courier"
              loading={summaryLoading}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 10, xs: 5, lg: 2 }}>
            <KpiCard
              tone="mint"
              icon={<IconCircleCheck size={24} stroke={1.8} />}
              label="Delivered"
              value={s ? formatCount(s.deliveredInRange) : undefined}
              hint={`Delivered ${rangeText}`}
              loading={summaryLoading}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 10, xs: 5, lg: 2 }}>
            <KpiCard
              tone="peach"
              icon={<IconClockHour4 size={24} stroke={1.8} />}
              label="Avg Delivery"
              value={s ? formatDeliveryHours(s.avgDeliveryHours) : undefined}
              hint={s && s.avgDeliveryHours !== null ? `${Number(s.avgDeliveryHours.toFixed(1))} hours, shipped → delivered` : "No timed deliveries in this period"}
              loading={summaryLoading}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 10, xs: 10, lg: 2 }}>
            <KpiCard
              tone="rose"
              icon={<IconTruckOff size={24} stroke={1.8} />}
              label="Cancelled in Transit"
              value={s ? formatCount(s.cancelledAfterShipping) : undefined}
              hint="Shipped, then cancelled in this period"
              loading={summaryLoading}
            />
          </Grid.Col>
        </Grid>
      )}

      <SectionCard
        title="By courier"
        subtitle={`In transit right now · delivered ${rangeText}`}
        fullHeight={false}
        loading={summaryLoading}
        skeleton={<CourierBreakdown couriers={undefined} loading />}
      >
        <CourierBreakdown couriers={s?.byCourier} loading={summaryLoading} />
      </SectionCard>

      <div>
        <FilterBar>
          <SegmentedControl
            aria-label="Delivery queue"
            radius="xl"
            color="secondaryGreen"
            value={queue}
            onChange={(value) => setParams({ queue: value === "ready" ? null : value, page: null })}
            data={DELIVERY_QUEUES.map((value) => {
              const count = queueCount(value);
              return {
                value,
                label: count !== null ? `${QUEUE_LABELS[value]} · ${formatCount(count)}` : QUEUE_LABELS[value],
              };
            })}
          />
          <TextInput
            aria-label="Search this queue"
            placeholder="Order no., name or phone"
            radius="xl"
            leftSection={<IconSearch size={16} aria-hidden />}
            rightSection={
              search ? (
                <CloseButton
                  size="sm"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    pushSearch.cancel();
                    setParams({ q: null, page: null });
                  }}
                />
              ) : null
            }
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              pushSearch(event.currentTarget.value);
            }}
            style={{ flex: "1 1 220px" }}
            maw={340}
          />
        </FilterBar>

        {queue === "delivered" ? (
          <Text size="xs" c="var(--mo-color-text-muted)" mb="xs" px={4}>
            Showing orders delivered {rangeText}, the same deliveries the “Delivered” figure above counts.
          </Text>
        ) : null}
        {queue === "ready" && canAssign ? (
          <Text size="xs" c="var(--mo-color-text-muted)" mb="xs" px={4}>
            Open an order to book the courier or enter a tracking number.
          </Text>
        ) : null}

        <DataTable
          label={QUEUE_LABELS[queue]}
          columns={columns}
          rows={list.data?.items}
          getRowKey={(order) => order.id}
          loading={list.isLoading}
          refreshing={list.isValidating}
          error={list.error}
          onRetry={() => void list.mutate()}
          permission={PERMISSIONS.ORDERS_READ}
          minWidth={980}
          skeletonRows={6}
          emptyIcon={<IconTruckDelivery stroke={1.6} />}
          emptyTitle={emptyCopy[queue].title}
          emptyDescription={emptyCopy[queue].description}
          getRowStyle={(order) =>
            queue === "transit" && (daysBetween(order.shippedAt, new Date()) ?? 0) >= 4
              ? { accent: "var(--mo-color-warning-5)" }
              : undefined
          }
          pagination={
            list.data
              ? {
                  page: list.data.meta.page,
                  totalPages: list.data.meta.totalPages,
                  total: list.data.meta.total,
                  limit: list.data.meta.limit,
                  onPageChange: (next) => setParams({ page: next > 1 ? next : null }),
                  onLimitChange: (next) => setParams({ limit: next === DEFAULT_LIMIT ? null : next, page: null }),
                  itemLabel: "orders",
                }
              : undefined
          }
        />
      </div>

      <ShipmentTrackingDrawer orderId={trackId} onClose={() => setParams({ track: null })} />
    </Stack>
  );
}
