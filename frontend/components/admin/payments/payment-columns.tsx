"use client";

import Link from "next/link";
import { ActionIcon, Box, Group, Text, Tooltip } from "@mantine/core";
import { IconArrowUpRight, IconBuildingBank, IconCash } from "@tabler/icons-react";
import { Price } from "../../Price";
import { StatusBadge } from "../../StatusBadge";
import { formatBangladeshMobile } from "../../../lib/phone";
import type { AdminOrderDTO } from "../../../types/admin";
import type { DataTableColumn } from "../DataTable";
import { formatDhakaDate, formatDhakaTime, paymentMethodLabel } from "../format";
import classes from "./payments.module.css";

/** Order number linking to the order drawer on the orders page. */
export function OrderNumberCell({ order }: { order: AdminOrderDTO }) {
  return (
    <Box>
      <Link href={`/admin/orders?orderId=${encodeURIComponent(order.id)}`} className={classes.orderLink} aria-label={`Open order ${order.orderNumber}`}>
        {order.orderNumber}
      </Link>
      <Text size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap" }}>
        {formatDhakaDate(order.createdAt)} · {formatDhakaTime(order.createdAt)}
      </Text>
    </Box>
  );
}

export function PaymentMethodCell({ method }: { method: AdminOrderDTO["paymentMethod"] }) {
  const Icon = method === "COD" ? IconCash : IconBuildingBank;
  return (
    <Group gap={8} wrap="nowrap">
      <Box className={classes.methodIcon} data-method={method} aria-hidden>
        <Icon size={16} />
      </Box>
      <Text size="sm" style={{ whiteSpace: "nowrap" }}>
        {paymentMethodLabel(method)}
      </Text>
    </Group>
  );
}

const orderColumn: DataTableColumn<AdminOrderDTO> = {
  key: "order",
  header: "Order",
  width: 220,
  skeletonWidth: "85%",
  cell: (order) => <OrderNumberCell order={order} />,
};

const customerColumn: DataTableColumn<AdminOrderDTO> = {
  key: "customer",
  header: "Customer",
  skeletonWidth: "70%",
  cell: (order) => (
    <Box style={{ minWidth: 0 }}>
      <Text size="sm" fw={600} truncate maw={220}>
        {order.customer.fullName}
      </Text>
      <Text size="xs" c="var(--mo-color-text-muted)" className="mo-tabular-nums">
        {formatBangladeshMobile(order.customer.phone)}
      </Text>
    </Box>
  ),
};

const methodColumn: DataTableColumn<AdminOrderDTO> = {
  key: "method",
  header: "Method",
  width: 190,
  skeletonWidth: "70%",
  cell: (order) => <PaymentMethodCell method={order.paymentMethod} />,
};

const paymentColumn: DataTableColumn<AdminOrderDTO> = {
  key: "payment",
  header: "Payment",
  width: 120,
  skeletonWidth: 64,
  cell: (order) => <StatusBadge status={order.paymentStatus} size="sm" style={{ maxWidth: "none" }} />,
};

const orderStatusColumn: DataTableColumn<AdminOrderDTO> = {
  key: "status",
  header: "Order status",
  width: 140,
  skeletonWidth: 76,
  cell: (order) => <StatusBadge status={order.status} size="sm" style={{ maxWidth: "none" }} />,
};

const amountColumn: DataTableColumn<AdminOrderDTO> = {
  key: "amount",
  header: "Amount",
  align: "right",
  width: 120,
  skeletonWidth: 64,
  cell: (order) => <Price value={order.total} size="sm" fw={600} />,
};

const openColumn: DataTableColumn<AdminOrderDTO> = {
  key: "open",
  header: "",
  align: "right",
  width: 56,
  skeletonWidth: 24,
  cell: (order) => (
    <Tooltip label="Open order" withArrow>
      <ActionIcon
        component={Link}
        href={`/admin/orders?orderId=${encodeURIComponent(order.id)}`}
        variant="subtle"
        color="gray"
        aria-label={`Open order ${order.orderNumber}`}
      >
        <IconArrowUpRight size={18} aria-hidden />
      </ActionIcon>
    </Tooltip>
  ),
};

/** Transactions table: order, customer, method, payment status, order status, amount. */
export const TRANSACTION_COLUMNS: readonly DataTableColumn<AdminOrderDTO>[] = [
  orderColumn,
  customerColumn,
  methodColumn,
  paymentColumn,
  orderStatusColumn,
  amountColumn,
  openColumn,
];

/** Refunds table: like transactions, with the delivery date instead of the payment badge. */
export const REFUND_COLUMNS: readonly DataTableColumn<AdminOrderDTO>[] = [
  orderColumn,
  customerColumn,
  methodColumn,
  orderStatusColumn,
  {
    key: "delivered",
    header: "Delivered",
    width: 130,
    skeletonWidth: 80,
    cell: (order) => (
      <Text size="sm" c={order.deliveredAt ? "var(--mo-color-text-strong)" : "var(--mo-color-text-subtle)"} style={{ whiteSpace: "nowrap" }}>
        {order.deliveredAt ? formatDhakaDate(order.deliveredAt) : "Not delivered"}
      </Text>
    ),
  },
  { ...amountColumn, header: "Refunded" },
  openColumn,
];
