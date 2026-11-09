"use client";

import { useState } from "react";
import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  Group,
  Menu,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconDotsVertical,
  IconEye,
  IconFileTypePdf,
  IconListDetails,
  IconReceipt,
  IconSearch,
  IconShoppingCart,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { StatusBadge } from "../../../components/StatusBadge";
import { DataTable, type DataTableColumn } from "../../../components/admin/DataTable";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import {
  formatCount,
  formatDhakaDate,
  formatDhakaDateTime,
  formatDhakaTime,
  formatMoney,
  initialsOf,
  paymentMethodLabel,
  pluralize,
} from "../../../components/admin/format";
import { PageHeader, Thumb, TONES, type DateRangeValue, type KpiTone } from "../../../components/admin/kit";
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
import { CountTabs, type CountTab } from "../../../components/admin/products/CountTabs";
import { ListCard } from "../../../components/admin/products/ListCard";
import { OptionalDateRange } from "../../../components/admin/products/OptionalDateRange";
import { useAdminOrders, useOrderStatusCounts } from "../../../hooks/admin/use-admin-orders";
import { pickParam, usePaging, useUrlParams } from "../../../hooks/admin/use-ops-url-state";
import { useCan } from "../../../hooks/admin/use-permission";
import { api, getErrorMessage } from "../../../lib/api-client";
import { PERMISSIONS } from "../../../types/auth";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "../../../types/order";
import {
  ADMIN_ORDER_STATUSES,
  ADMIN_PAYMENT_METHODS,
  ADMIN_PAYMENT_STATUSES,
  type AdminOrderDTO,
} from "../../../types/admin";

type StatusFilter = OrderStatus | "ALL";

const STATUS_FILTERS = ["ALL", ...ADMIN_ORDER_STATUSES] as const satisfies readonly StatusFilter[];

const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: "All",
  PENDING: "Pending",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

const PAYMENT_STATUS_OPTIONS = [
  { value: "ALL", label: "Any payment status" },
  { value: "PAID", label: "Paid" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "FAILED", label: "Failed" },
] satisfies { value: PaymentStatus | "ALL"; label: string }[];

const PAYMENT_METHOD_OPTIONS = [
  { value: "ALL", label: "Any payment method" },
  ...ADMIN_PAYMENT_METHODS.map((value) => ({ value, label: paymentMethodLabel(value) })),
];

const AVATAR_TONES: readonly KpiTone[] = ["lavender", "sky", "mint", "peach", "rose"];

/** Stable pastel per customer (same person → same color on every row). */
function avatarTone(seed: string): KpiTone {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length] ?? "mint";
}

export default function AdminOrdersPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ORDERS_READ}>
      <OrdersView />
    </RequirePermission>
  );
}

function OrdersView() {
  const { searchParams, setParams } = useUrlParams();
  const permissions: OrderPermissions = {
    canUpdateStatus: useCan(PERMISSIONS.ORDERS_STATUS_UPDATE),
    canApproveRefunds: useCan(PERMISSIONS.REFUNDS_APPROVE),
    canAssignCourier: useCan(PERMISSIONS.COURIER_ASSIGN),
  };

  // Deep-linkable state lives in the URL: ?status= (tab), ?orderId= (drawer), ?q= (search seed).
  const status = pickParam<StatusFilter>(searchParams.get("status"), STATUS_FILTERS, "ALL");
  const detailId = searchParams.get("orderId");
  const urlQuery = searchParams.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState({ source: urlQuery, text: urlQuery });
  const search = searchDraft.source === urlQuery ? searchDraft.text : urlQuery;
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [range, setRange] = useState<DateRangeValue | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "ALL">("ALL");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "ALL">("ALL");

  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [statusRequest, setStatusRequest] = useState<StatusChangeRequest | null>(null);
  const [dispatchOrder, setDispatchOrder] = useState<OrderRef | null>(null);
  const [openingInvoice, setOpeningInvoice] = useState<string | null>(null);

  const shared = {
    q: debouncedSearch,
    from: range?.from ?? null,
    to: range?.to ?? null,
    paymentStatus,
    paymentMethod,
  };
  const paging = usePaging(JSON.stringify({ status, ...shared }));
  const list = useAdminOrders({ page: paging.page, limit: paging.limit, status, ...shared });
  const counts = useOrderStatusCounts(shared);

  const activeFilters =
    (search.trim() ? 1 : 0) + (range ? 1 : 0) + (paymentStatus !== "ALL" ? 1 : 0) + (paymentMethod !== "ALL" ? 1 : 0);
  const filtered = status !== "ALL" || activeFilters > 0;

  const clearFilters = () => {
    setSearchDraft({ source: urlQuery, text: "" });
    setRange(null);
    setPaymentStatus("ALL");
    setPaymentMethod("ALL");
    if (urlQuery) {
      setParams({ q: null });
    }
  };

  const openDetail = (orderId: string) => setParams({ orderId });
  const requestStatus = (order: OrderRef, target: OrderStatus) => setStatusRequest({ order, target });

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

  const statusCounts = counts.data;
  const tabs: CountTab<StatusFilter>[] = STATUS_FILTERS.map((value) => ({
    value,
    label: STATUS_LABELS[value],
    count: statusCounts
      ? value === "ALL"
        ? ADMIN_ORDER_STATUSES.reduce((sum, key) => sum + statusCounts[key], 0)
        : statusCounts[value]
      : null,
  }));

  const columns: DataTableColumn<AdminOrderDTO>[] = [
    {
      key: "customer",
      header: "Order & customer",
      width: 250,
      skeletonWidth: "85%",
      cell: (order) => {
        const tone = TONES[avatarTone(order.customer.id)];
        return (
          <Group gap="sm" wrap="nowrap" miw={200}>
            <Avatar
              radius="xl"
              size={36}
              styles={{ placeholder: { backgroundColor: tone.iconBg, color: tone.icon, fontSize: 12, fontWeight: 700 } }}
              aria-hidden
            >
              {initialsOf(order.customer.fullName)}
            </Avatar>
            <Box style={{ minWidth: 0 }}>
              <UnstyledButton
                onClick={() => openDetail(order.id)}
                aria-label={`Open order ${order.orderNumber}`}
                ff="var(--mo-font-monospace)"
                fz={11}
                fw={600}
                c="var(--mo-color-text-muted)"
                style={{ whiteSpace: "nowrap" }}
              >
                {order.orderNumber}
              </UnstyledButton>
              <Text size="sm" fw={600} lineClamp={1} c="var(--mo-color-text)">
                {order.customer.fullName}
              </Text>
              <Text size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap" }}>
                {order.shippingAddress.phone} · {order.shippingAddress.district}
              </Text>
            </Box>
          </Group>
        );
      },
    },
    {
      key: "products",
      header: "Products",
      width: 240,
      cell: (order) => {
        const first = order.items[0];
        const others = order.items.length - 1;
        return (
          <Group gap={10} wrap="nowrap" miw={180}>
            <Thumb src={first?.productImage} size={40} />
            <Box style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} lineClamp={1} c="var(--mo-color-text)">
                {first?.productTitle ?? "—"}
              </Text>
              <Text size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap" }}>
                {pluralize(order.itemCount, "item")}
                {others > 0 ? ` · +${formatCount(others)} more` : ""}
              </Text>
            </Box>
          </Group>
        );
      },
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      width: 110,
      cell: (order) => (
        <Text size="sm" fw={700} className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }} c="var(--mo-color-text)">
          {formatMoney(order.total)}
        </Text>
      ),
    },
    {
      key: "payment",
      header: "Payment",
      width: 150,
      cell: (order) => (
        <Stack gap={4} align="flex-start">
          <StatusBadge status={order.paymentStatus} size="sm" />
          <Text size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap" }}>
            {paymentMethodLabel(order.paymentMethod)}
          </Text>
        </Stack>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 150,
      cell: (order) => (
        <Stack gap={4} align="flex-start">
          <StatusBadge status={order.status} size="sm" />
          {order.trackingId ? (
            <Text
              size="xs"
              c="var(--mo-color-text-muted)"
              ff="var(--mo-font-monospace)"
              truncate="end"
              maw={140}
              title={`${courierName(order.courierProvider)} · ${order.trackingId}`}
            >
              {order.trackingId}
            </Text>
          ) : null}
        </Stack>
      ),
    },
    {
      key: "date",
      header: "Date",
      width: 120,
      cell: (order) => (
        <Text
          component="time"
          dateTime={order.createdAt}
          title={formatDhakaDateTime(order.createdAt)}
          size="xs"
          lh={1.5}
          c="var(--mo-color-text-secondary)"
          display="block"
          style={{ whiteSpace: "nowrap" }}
        >
          {formatDhakaDate(order.createdAt)}
          <br />
          {formatDhakaTime(order.createdAt)}
        </Text>
      ),
    },
    {
      key: "actions",
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: "right",
      width: 210,
      skeletonWidth: 120,
      cell: (order) => {
        const transitions = visibleTransitions(order, permissions);
        const dispatchable = canDispatch(order, permissions);
        const quick =
          order.status === "PENDING" && transitions.includes("PROCESSING") ? (
            <Button
              size="compact-sm"
              radius="xl"
              variant="light"
              color="secondaryGreen"
              leftSection={<IconCheck size={14} aria-hidden />}
              onClick={() => requestStatus(order, "PROCESSING")}
              aria-label={`Accept order ${order.orderNumber}`}
            >
              Accept
            </Button>
          ) : dispatchable ? (
            <Button
              size="compact-sm"
              radius="xl"
              variant="light"
              color="accentPurple"
              leftSection={<IconTruckDelivery size={14} aria-hidden />}
              onClick={() => setDispatchOrder(order)}
              aria-label={`Dispatch order ${order.orderNumber}`}
            >
              Dispatch
            </Button>
          ) : null;
        return (
          <Group gap={6} justify="flex-end" wrap="nowrap">
            {quick}
            <Button
              size="compact-sm"
              radius="xl"
              variant="light"
              color="info"
              onClick={() => openDetail(order.id)}
              aria-label={`View order ${order.orderNumber}`}
            >
              View
            </Button>
            <Menu position="bottom-end" withinPortal width={240}>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" radius="xl" aria-label={`More actions for ${order.orderNumber}`}>
                  <IconDotsVertical size={18} aria-hidden />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconEye size={16} aria-hidden />} onClick={() => openDetail(order.id)}>
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
    <Stack gap="lg">
      <PageHeader
        mb={0}
        icon={<IconShoppingCart size={20} />}
        title="Orders"
        subtitle={
          permissions.canUpdateStatus
            ? "Accept, dispatch and track orders: Pending → Processing → Shipped → Delivered. Times are in Dhaka."
            : "Look up orders, invoices and shipments. You have read-only access. Times are in Dhaka."
        }
      />

      <ListCard
        title="All orders"
        icon={<IconListDetails size={18} color="var(--mo-color-secondary-8)" aria-hidden />}
        subtitle={meta ? `${pluralize(meta.total, filtered ? "matching order" : "order")}` : "Loading orders…"}
        tabs={
          <CountTabs
            label="Order status"
            value={status}
            onChange={(next) => setParams({ status: next === "ALL" ? null : next })}
            tabs={tabs}
          />
        }
        filters={
          <>
            <TextInput
              aria-label="Search orders"
              placeholder="Order no., name, phone or email"
              leftSection={<IconSearch size={16} aria-hidden />}
              radius="xl"
              value={search}
              onChange={(event) => setSearchDraft({ source: urlQuery, text: event.currentTarget.value })}
              w={{ base: "100%", sm: 300 }}
            />
            <OptionalDateRange label="Placed" value={range} onChange={setRange} />
            <Select
              aria-label="Payment status"
              data={PAYMENT_STATUS_OPTIONS}
              value={paymentStatus}
              allowDeselect={false}
              onChange={(value) => setPaymentStatus(ADMIN_PAYMENT_STATUSES.find((item) => item === value) ?? "ALL")}
              w={{ base: "100%", xs: 190 }}
              radius="xl"
            />
            <Select
              aria-label="Payment method"
              data={PAYMENT_METHOD_OPTIONS}
              value={paymentMethod}
              allowDeselect={false}
              onChange={(value) => setPaymentMethod(ADMIN_PAYMENT_METHODS.find((item) => item === value) ?? "ALL")}
              w={{ base: "100%", xs: 200 }}
              radius="xl"
            />
          </>
        }
        activeFilterCount={activeFilters}
        onResetFilters={clearFilters}
      >
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
          minWidth={1120}
          skeletonRows={10}
          emptyIcon={<IconReceipt stroke={1.6} />}
          emptyTitle={filtered ? "No orders match these filters" : "No orders yet"}
          emptyDescription={
            filtered ? "Try another status, a wider date range or clear the search." : "Orders appear here as soon as customers check out."
          }
          emptyAction={
            activeFilters > 0 ? (
              <Button variant="light" radius="xl" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null
          }
          pagination={
            meta
              ? {
                  page: meta.page,
                  totalPages: meta.totalPages,
                  total: meta.total,
                  limit: meta.limit,
                  onPageChange: paging.setPage,
                  onLimitChange: paging.setLimit,
                  itemLabel: "orders",
                }
              : undefined
          }
        />
      </ListCard>

      <OrderDetailDrawer
        orderId={detailId}
        onClose={() => setParams({ orderId: null })}
        permissions={permissions}
        onChangeStatus={requestStatus}
        onDispatch={setDispatchOrder}
        onTrack={setTrackingId}
        onInvoice={(order) => void openInvoice(order)}
      />
      <TrackingDrawer orderId={trackingId} onClose={() => setTrackingId(null)} />
      <StatusChangeModal request={statusRequest} onClose={() => setStatusRequest(null)} list={{ mutate: list.mutate, current: list.data }} />
      <DispatchModal order={dispatchOrder} onClose={() => setDispatchOrder(null)} />
    </Stack>
  );
}
