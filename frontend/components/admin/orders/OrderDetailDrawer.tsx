"use client";

import Link from "next/link";
import {
  Anchor,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconFileSpreadsheet, IconFileTypePdf, IconMapPin, IconTruckDelivery, IconUser } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { StatusBadge } from "../../StatusBadge";
import { useAdminOrderDetail } from "../../../hooks/admin/use-admin-orders";
import { useCan } from "../../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../../types/auth";
import type { OrderStatus } from "../../../types/order";
import { formatCalendarDate, formatCount, formatDhakaDateTime, formatMoney, paymentMethodLabel } from "../format";
import { Thumb } from "../kit";
import { QueryError } from "../QueryError";
import { canDispatch, courierName, TRANSITION_LABELS, visibleTransitions, type OrderPermissions, type OrderRef } from "./order-utils";
import { OrderTimeline } from "./OrderTimeline";

export interface OrderDetailDrawerProps {
  orderId: string | null;
  onClose: () => void;
  permissions: OrderPermissions;
  onChangeStatus: (order: OrderRef, target: OrderStatus) => void;
  onDispatch: (order: OrderRef) => void;
  onTrack: (orderId: string) => void;
  onInvoice: (order: OrderRef) => void;
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Group gap={6} mb="xs" c="var(--mo-color-secondary-8)">
        {icon}
        <Text size="xs" c="var(--mo-color-text-secondary)" fw={700} tt="uppercase" style={{ letterSpacing: "0.04em" }}>
          {title}
        </Text>
      </Group>
      {children}
    </Paper>
  );
}

function TotalRow({ label, value, strong = false }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <Group justify="space-between">
      <Text size="sm" fw={strong ? 700 : 400} c={strong ? undefined : "var(--mo-color-text-secondary)"}>
        {label}
      </Text>
      <Text size="sm" fw={strong ? 700 : 500} className="mo-tabular-nums">
        {value}
      </Text>
    </Group>
  );
}

/** Full order: customer, address, items per batch, totals, courier and timeline. */
export function OrderDetailDrawer({
  orderId,
  onClose,
  permissions,
  onChangeStatus,
  onDispatch,
  onTrack,
  onInvoice,
}: OrderDetailDrawerProps) {
  const { data: order, error, isLoading, mutate } = useAdminOrderDetail(orderId);
  const canLedger = useCan(PERMISSIONS.STOCK_ADJUST);

  const transitions = order ? visibleTransitions(order, permissions) : [];

  return (
    <Drawer opened={orderId !== null} onClose={onClose} position="right" size="xl" title={<Text fw={700}>Order details</Text>}>
      {isLoading && !order ? (
        <Stack gap="md">
          <Skeleton height={28} width="55%" />
          <Skeleton height={36} width="80%" radius="xl" />
          <SimpleGrid cols={2} spacing="md">
            <Skeleton height={120} radius="md" />
            <Skeleton height={120} radius="md" />
          </SimpleGrid>
          <Skeleton height={220} radius="md" />
          <Skeleton height={160} radius="md" />
        </Stack>
      ) : null}
      {error && !order ? <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.ORDERS_READ} /> : null}

      {order ? (
        <Stack gap="lg">
          <Box>
            <Group gap="xs" mb={6}>
              <StatusBadge status={order.status} />
              <StatusBadge status={order.paymentStatus} variant="outline" />
            </Group>
            <Title order={2} fz={22} ff="var(--mo-font-monospace)">
              {order.orderNumber}
            </Title>
            <Text size="sm" c="var(--mo-color-text-muted)">
              Placed {formatDhakaDateTime(order.createdAt)} · {paymentMethodLabel(order.paymentMethod)}
            </Text>
          </Box>

          <Group gap="xs" wrap="wrap">
            {transitions.map((status) => (
              <Button
                key={status}
                size="xs"
                radius="xl"
                variant={status === "CANCELLED" || status === "REFUNDED" ? "light" : "filled"}
                color={status === "CANCELLED" || status === "REFUNDED" ? "danger" : "primaryPink"}
                onClick={() => onChangeStatus(order, status)}
              >
                {TRANSITION_LABELS[status]}
              </Button>
            ))}
            {canDispatch(order, permissions) ? (
              <Button size="xs" radius="xl" color="secondaryGreen" leftSection={<IconTruckDelivery size={14} aria-hidden />} onClick={() => onDispatch(order)}>
                Dispatch to courier
              </Button>
            ) : null}
            <Button size="xs" radius="xl" variant="default" leftSection={<IconFileTypePdf size={14} aria-hidden />} onClick={() => onInvoice(order)}>
              Invoice PDF
            </Button>
            {order.trackingId || order.status === "SHIPPED" ? (
              <Button size="xs" radius="xl" variant="default" leftSection={<IconTruckDelivery size={14} aria-hidden />} onClick={() => onTrack(order.id)}>
                Tracking
              </Button>
            ) : null}
            {canLedger ? (
              <Button
                size="xs"
                radius="xl"
                variant="subtle"
                color="gray"
                component={Link}
                href={`/admin/ledger?orderId=${order.id}`}
                leftSection={<IconFileSpreadsheet size={14} aria-hidden />}
              >
                Stock movements
              </Button>
            ) : null}
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Section title="Customer" icon={<IconUser size={14} aria-hidden />}>
              <Text size="sm" fw={600}>
                {order.customer.fullName}
              </Text>
              <Text size="sm">{order.customer.phone}</Text>
              {order.customer.email ? (
                <Anchor href={`mailto:${order.customer.email}`} size="sm">
                  {order.customer.email}
                </Anchor>
              ) : null}
            </Section>
            <Section title="Ship to" icon={<IconMapPin size={14} aria-hidden />}>
              <Text size="sm" fw={600}>
                {order.shippingAddress.fullName}
              </Text>
              <Text size="sm">{order.shippingAddress.phone}</Text>
              <Text size="sm" c="var(--mo-color-text-secondary)">
                {order.shippingAddress.addressLine1}
                {order.shippingAddress.addressLine2 ? `, ${order.shippingAddress.addressLine2}` : ""}
                <br />
                {order.shippingAddress.city}, {order.shippingAddress.district} {order.shippingAddress.postalCode}
              </Text>
            </Section>
          </SimpleGrid>

          <Box>
            <Text fw={600} mb="xs">
              Items ({formatCount(order.items.reduce((sum, item) => sum + item.quantity, 0))})
            </Text>
            <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
              <Table.ScrollContainer minWidth={600} type="native">
                <Table verticalSpacing="xs" horizontalSpacing="md" aria-label={`Items in ${order.orderNumber}`}>
                  <Table.Thead bg="var(--mo-color-surface-muted)">
                    <Table.Tr>
                      <Table.Th scope="col">Product</Table.Th>
                      <Table.Th scope="col">Batch</Table.Th>
                      <Table.Th scope="col" ta="right">
                        Qty
                      </Table.Th>
                      <Table.Th scope="col" ta="right">
                        Price
                      </Table.Th>
                      <Table.Th scope="col" ta="right">
                        Total
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {order.items.map((item) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>
                          <Group gap="sm" wrap="nowrap">
                            <Thumb src={item.productImage} size={40} />
                            <Box style={{ minWidth: 0 }}>
                              <Text size="sm" fw={500} lineClamp={2}>
                                {item.productTitle}
                              </Text>
                              {item.productSku ? (
                                <Text size="xs" c="var(--mo-color-text-muted)" ff="var(--mo-font-monospace)">
                                  {item.productSku}
                                </Text>
                              ) : null}
                            </Box>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          {item.batchNumber ? (
                            <>
                              <Text size="sm" ff="var(--mo-font-monospace)">
                                {item.batchNumber}
                              </Text>
                              {item.batchExpiryDate ? (
                                <Text size="xs" c="var(--mo-color-text-muted)">
                                  Exp. {formatCalendarDate(item.batchExpiryDate)}
                                </Text>
                              ) : null}
                            </>
                          ) : (
                            <Text size="sm" c="var(--mo-color-text-muted)">
                              —
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="right" className="mo-tabular-nums">
                          {formatCount(item.quantity)}
                        </Table.Td>
                        <Table.Td ta="right" className="mo-tabular-nums">
                          {formatMoney(item.unitPrice)}
                        </Table.Td>
                        <Table.Td ta="right" className="mo-tabular-nums">
                          <Text size="sm" fw={600}>
                            {formatMoney(item.totalPrice)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
            <Stack gap={4} mt="sm" ml="auto" maw={320}>
              <TotalRow label="Subtotal" value={formatMoney(order.subtotal)} />
              {order.discountAmount > 0 ? (
                <TotalRow
                  label={order.couponCode ? `Discount (${order.couponCode})` : "Discount"}
                  value={`−${formatMoney(order.discountAmount)}`}
                />
              ) : null}
              <TotalRow label="Delivery" value={order.deliveryFee > 0 ? formatMoney(order.deliveryFee) : "Free"} />
              <Divider my={4} />
              <TotalRow label="Total" value={formatMoney(order.total)} strong />
            </Stack>
          </Box>

          {order.trackingId ? (
            <Section title="Shipment" icon={<IconTruckDelivery size={14} aria-hidden />}>
              <Text size="sm">
                {courierName(order.courierProvider)} ·{" "}
                <Text component="span" inherit ff="var(--mo-font-monospace)" fw={600}>
                  {order.trackingId}
                </Text>
              </Text>
              <Text size="xs" c="var(--mo-color-text-muted)">
                Shipped {formatDhakaDateTime(order.shippedAt)}
                {order.deliveredAt ? ` · Delivered ${formatDhakaDateTime(order.deliveredAt)}` : ""}
              </Text>
            </Section>
          ) : null}

          <Box>
            <Text fw={600} mb="sm">
              Timeline
            </Text>
            <OrderTimeline history={order.statusHistory} />
          </Box>
        </Stack>
      ) : null}
    </Drawer>
  );
}
