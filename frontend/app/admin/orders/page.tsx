"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Group,
  Menu,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconDotsVertical,
  IconEye,
  IconFileTypePdf,
  IconMapPin,
  IconReceipt,
  IconSearch,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { Price } from "../../../components/Price";
import { StatusBadge } from "../../../components/StatusBadge";
import { DataTable, type DataTableColumn } from "../../../components/admin/DataTable";
import { DateRangeFilter, isCompleteRange, type DateRange } from "../../../components/admin/DateRangeFilter";
import { FilterBar } from "../../../components/admin/FilterBar";
import { PageHeader } from "../../../components/admin/PageHeader";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import { formatCount, formatDhakaDateTime, paymentMethodLabel } from "../../../components/admin/format";
import { DispatchModal } from "../../../components/admin/orders/DispatchModal";
import { OrderDetailDrawer } from "../../../components/admin/orders/OrderDetailDrawer";
import {
  canDispatch,
  courierName,
  TRANSITION_LABELS,
  visibleTransitions,
  type OrderPermissions,
  type OrderRef,
} from "../../../components/admin/orders/order-utils";
import { StatusChangeModal, type StatusChangeRequest } from "../../../components/admin/orders/StatusChangeModal";
import { TrackingDrawer } from "../../../components/admin/orders/TrackingDrawer";
import { useAdminOrders } from "../../../hooks/admin/use-admin-orders";
import { useCan } from "../../../hooks/admin/use-permission";
import { api, getErrorMessage } from "../../../lib/api-client";
import { PERMISSIONS } from "../../../types/auth";
import type { OrderStatus } from "../../../types/order";
import { ADMIN_ORDER_STATUSES, type AdminOrderDTO } from "../../../types/admin";

type StatusFilter = OrderStatus | "ALL";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REFUNDED", label: "Refunded" },
];

function parseStatus(value: string | null): StatusFilter {
  return ADMIN_ORDER_STATUSES.find((status) => status === value) ?? "ALL";
}

export default function AdminOrdersPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ORDERS_READ}>
      <OrdersView />
    </RequirePermission>
  );
}

function OrdersView() {
  const searchParams = useSearchParams();
  const permissions: OrderPermissions = {
    canUpdateStatus: useCan(PERMISSIONS.ORDERS_STATUS_UPDATE),
    canApproveRefunds: useCan(PERMISSIONS.REFUNDS_APPROVE),
    canAssignCourier: useCan(PERMISSIONS.COURIER_ASSIGN),
  };

  const [status, setStatus] = useState<StatusFilter>(() => parseStatus(searchParams.get("status")));
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [range, setRange] = useState<DateRange>([null, null]);
  const [appliedRange, setAppliedRange] = useState<DateRange>([null, null]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [statusRequest, setStatusRequest] = useState<StatusChangeRequest | null>(null);
  const [dispatchOrder, setDispatchOrder] = useState<OrderRef | null>(null);
  const [openingInvoice, setOpeningInvoice] = useState<string | null>(null);

  const list = useAdminOrders({
    page,
    limit,
    status,
    q: debouncedSearch,
    from: appliedRange[0],
    to: appliedRange[1],
  });

  const activeFilters = (search.trim() ? 1 : 0) + (appliedRange[0] ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    setRange([null, null]);
    setAppliedRange([null, null]);
    setPage(1);
  };

  const openInvoice = async (order: OrderRef) => {
    setOpeningInvoice(order.id);
    try {
      await api.open(`/orders/${order.id}/invoice`);
    } catch (error) {
      notifications.show({ color: "danger", title: `Invoice for ${order.orderNumber}`, message: getErrorMessage(error) });
    } finally {
      setOpeningInvoice(null);
    }
  };

  const requestStatus = (order: OrderRef, target: OrderStatus) => setStatusRequest({ order, target });

  const columns: DataTableColumn<AdminOrderDTO>[] = [
    {
      key: "order",
      header: "Order",
      width: 210,
      cell: (order) => (
        <Box>
          <Anchor component="button" type="button" size="sm" fw={700} ff="var(--mo-font-monospace)" onClick={() => setDetailId(order.id)}>
            {order.orderNumber}
          </Anchor>
          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            {formatDhakaDateTime(order.createdAt)}
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
          <Text size="sm" fw={500} lineClamp={1}>
            {order.customer.fullName}
          </Text>
          <Text size="xs" c="dimmed">
            {order.shippingAddress.phone}
          </Text>
          <Text size="xs" c="dimmed" visibleFrom="xl">
            <IconMapPin size={10} aria-hidden /> {order.shippingAddress.city}, {order.shippingAddress.district}
          </Text>
        </Box>
      ),
    },
    {
      key: "items",
      header: "Items",
      align: "right",
      width: 70,
      visibleFrom: "md",
      cell: (order) => (
        <Text size="sm" className="mo-tabular-nums">
          {formatCount(order.itemCount)}
        </Text>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      width: 110,
      cell: (order) => <Price value={order.total} size="sm" />,
    },
    {
      key: "payment",
      header: "Payment",
      width: 160,
      visibleFrom: "lg",
      cell: (order) => (
        <Stack gap={2} align="flex-start">
          <StatusBadge status={order.paymentStatus} size="xs" />
          <Text size="xs" c="dimmed">
            {paymentMethodLabel(order.paymentMethod)}
          </Text>
        </Stack>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 140,
      cell: (order) => (
        <Stack gap={2} align="flex-start">
          <StatusBadge status={order.status} size="sm" />
          {order.trackingId ? (
            <Text size="xs" c="dimmed" ff="var(--mo-font-monospace)" lineClamp={1}>
              {courierName(order.courierProvider)} · {order.trackingId}
            </Text>
          ) : null}
        </Stack>
      ),
    },
    {
      key: "actions",
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: "right",
      width: 170,
      skeletonWidth: 90,
      cell: (order) => {
        const transitions = visibleTransitions(order, permissions);
        const dispatchable = canDispatch(order, permissions);
        const primary =
          order.status === "PENDING" && transitions.includes("PROCESSING") ? (
            <Button size="compact-sm" variant="light" onClick={() => requestStatus(order, "PROCESSING")}>
              Accept
            </Button>
          ) : dispatchable ? (
            <Button size="compact-sm" variant="light" color="secondaryGreen" onClick={() => setDispatchOrder(order)}>
              Dispatch
            </Button>
          ) : order.status === "SHIPPED" ? (
            <Button size="compact-sm" variant="default" onClick={() => setTrackingId(order.id)}>
              Track
            </Button>
          ) : null;
        return (
          <Group gap={4} justify="flex-end" wrap="nowrap">
            {primary}
            <Menu position="bottom-end" withinPortal width={240}>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${order.orderNumber}`}>
                  <IconDotsVertical size={18} aria-hidden />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconEye size={16} aria-hidden />} onClick={() => setDetailId(order.id)}>
                  View details
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconFileTypePdf size={16} aria-hidden />}
                  onClick={() => void openInvoice(order)}
                  disabled={openingInvoice === order.id}
                >
                  {openingInvoice === order.id ? "Opening invoice…" : "Invoice PDF"}
                </Menu.Item>
                {order.trackingId || order.status === "SHIPPED" ? (
                  <Menu.Item leftSection={<IconTruckDelivery size={16} aria-hidden />} onClick={() => setTrackingId(order.id)}>
                    Shipment tracking
                  </Menu.Item>
                ) : null}
                {dispatchable ? (
                  <Menu.Item leftSection={<IconTruckDelivery size={16} aria-hidden />} onClick={() => setDispatchOrder(order)}>
                    Dispatch to courier
                  </Menu.Item>
                ) : null}
                {transitions.length > 0 ? (
                  <>
                    <Menu.Divider />
                    <Menu.Label>Change status</Menu.Label>
                    {transitions.map((target) => (
                      <Menu.Item
                        key={target}
                        color={target === "CANCELLED" || target === "REFUNDED" ? "danger" : undefined}
                        onClick={() => requestStatus(order, target)}
                      >
                        {TRANSITION_LABELS[target]}
                      </Menu.Item>
                    ))}
                  </>
                ) : null}
              </Menu.Dropdown>
            </Menu>
          </Group>
        );
      },
    },
  ];

  const meta = list.data?.meta;

  return (
    <Stack gap={0}>
      <PageHeader
        title="Orders"
        description={
          permissions.canUpdateStatus
            ? "Accept, dispatch and track orders. Pending → Processing → Shipped → Delivered. Times are in Dhaka."
            : "Look up orders, invoices and shipments. You have read-only access."
        }
      />

      <ScrollArea type="auto" offsetScrollbars mb="md">
        <SegmentedControl
          value={status}
          onChange={(value) => {
            setStatus(value === "ALL" ? "ALL" : parseStatus(value));
            setPage(1);
          }}
          data={STATUS_TABS}
          aria-label="Order status"
        />
      </ScrollArea>

      <FilterBar activeCount={activeFilters} onReset={clearFilters}>
        <TextInput
          variant="search"
          label="Search"
          placeholder="Order number, name, phone or email"
          leftSection={<IconSearch size={16} aria-hidden />}
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          w={{ base: "100%", sm: 320 }}
        />
        <DateRangeFilter
          label="Placed"
          value={range}
          onChange={(next) => {
            setRange(next);
            if (isCompleteRange(next)) {
              setAppliedRange(next);
              setPage(1);
            }
          }}
        />
      </FilterBar>

      <DataTable
        label="Orders"
        columns={columns}
        rows={list.data?.items}
        getRowKey={(order) => order.id}
        loading={list.isLoading}
        refreshing={list.isLoading && Boolean(list.data)}
        error={list.error}
        onRetry={() => void list.mutate()}
        permission={PERMISSIONS.ORDERS_READ}
        minWidth={940}
        emptyIcon={<IconReceipt stroke={1.6} />}
        emptyTitle={status !== "ALL" || activeFilters > 0 ? "No orders match these filters" : "No orders yet"}
        emptyDescription={status !== "ALL" || activeFilters > 0 ? "Try another status, a wider date range or clear the search." : "Orders appear here as soon as customers check out."}
        pagination={
          meta
            ? {
                page: meta.page,
                totalPages: meta.totalPages,
                total: meta.total,
                limit: meta.limit,
                onPageChange: setPage,
                onLimitChange: (value) => {
                  setLimit(value);
                  setPage(1);
                },
                itemLabel: "orders",
              }
            : undefined
        }
      />

      <OrderDetailDrawer
        orderId={detailId}
        onClose={() => setDetailId(null)}
        permissions={permissions}
        onChangeStatus={requestStatus}
        onDispatch={setDispatchOrder}
        onTrack={setTrackingId}
        onInvoice={(order) => void openInvoice(order)}
      />
      <TrackingDrawer orderId={trackingId} onClose={() => setTrackingId(null)} />
      <StatusChangeModal
        request={statusRequest}
        onClose={() => setStatusRequest(null)}
        list={{ mutate: list.mutate, current: list.data }}
      />
      <DispatchModal order={dispatchOrder} onClose={() => setDispatchOrder(null)} />
    </Stack>
  );
}
