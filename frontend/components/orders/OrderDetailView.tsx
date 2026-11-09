"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Anchor, Button, Container, Grid, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconCash,
  IconFileInvoice,
  IconMapPin,
  IconMapPinSearch,
  IconReceipt2,
  IconRoute,
  IconX,
} from "@tabler/icons-react";
import { BrandButton } from "../BrandButton";
import { StatusBadge, getStatusConfig } from "../StatusBadge";
import { OrderTotals } from "../checkout/OrderTotals";
import { CancelOrderModal } from "./CancelOrderModal";
import { OrderItemsCard } from "./OrderItemsCard";
import { OrderDetailSkeleton, OrderErrorState } from "./OrderStates";
import { OrderSuccessHero } from "./OrderSuccessHero";
import { OrderTimeline } from "./OrderTimeline";
import { formatDhakaDateTime, ORDER_REF_PATTERN, PAYMENT_METHOD_LABEL } from "./order-format";
import { useRequireAuth } from "../../hooks/auth/use-auth-ready";
import { useOrder, useOrderActions } from "../../hooks/orders/use-orders";
import { getErrorMessage } from "../../lib/api-client";
import { formatBDT } from "../../lib/format";
import { formatBangladeshMobile } from "../../lib/phone";
import { semantic } from "../../tokens";

function SideCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="lg" bg={semantic.surface}>
      <Group gap={8} mb="sm" wrap="nowrap">
        {icon}
        <Title order={2} size="h5" c={semantic.text}>
          {title}
        </Title>
      </Group>
      {children}
    </Paper>
  );
}

export interface OrderDetailViewProps {
  orderNumber: string;
}

/** `/orders/[orderNumber]` — order detail; with `?placed=1` it opens with the success hero. */
export function OrderDetailView({ orderNumber }: OrderDetailViewProps) {
  const searchParams = useSearchParams();
  const justPlaced = searchParams.get("placed") === "1";
  const validReference = ORDER_REF_PATTERN.test(orderNumber);
  const encoded = encodeURIComponent(orderNumber);

  const { status } = useRequireAuth(`/orders/${encoded}${justPlaced ? "?placed=1" : ""}`);
  const { order, error, isLoading, mutate } = useOrder(orderNumber, status === "authenticated" && validReference);
  const { downloadInvoice } = useOrderActions();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (status !== "authenticated") {
    return <OrderDetailSkeleton />;
  }
  if (!validReference || (error && !order)) {
    return (
      <Container size="sm" py={{ base: "xl", md: 64 }}>
        <Title order={1} size="h2" c={semantic.text} mb="lg">
          Order {validReference ? orderNumber : ""}
        </Title>
        <OrderErrorState error={error} invalidReference={!validReference} onRetry={() => void mutate()} />
      </Container>
    );
  }
  if (isLoading || !order) {
    return <OrderDetailSkeleton />;
  }

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadInvoice(order);
    } catch (downloadError) {
      notifications.show({
        color: "danger",
        title: "Couldn't download the invoice",
        message: getErrorMessage(downloadError, "Please try again in a moment."),
      });
    } finally {
      setDownloading(false);
    }
  };

  const placedAt = formatDhakaDateTime(order.createdAt);
  const paymentLabel = getStatusConfig(order.paymentStatus).label;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const address = order.shippingAddress;

  return (
    <Container size="lg" py={{ base: "lg", md: "xl" }}>
      <Anchor component={Link} href="/orders" size="sm" c={semantic.textBrand} mb="md" display="inline-block">
        <Group gap={4} wrap="nowrap" component="span">
          <IconArrowLeft size={14} aria-hidden />
          My orders
        </Group>
      </Anchor>

      {justPlaced ? (
        <OrderSuccessHero orderNumber={order.orderNumber} total={order.total} paymentMethod={order.paymentMethod} />
      ) : null}

      <Paper withBorder radius="md" p={{ base: "md", sm: "lg" }} mb="lg" bg={semantic.surface} shadow="card">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Stack gap={4}>
            <Title order={justPlaced ? 2 : 1} size="h3" c={semantic.text}>
              Order {order.orderNumber}
            </Title>
            {placedAt ? (
              <Text size="sm" c="dimmed">
                Placed on <time dateTime={order.createdAt}>{placedAt}</time>
              </Text>
            ) : null}
          </Stack>
          <Group gap="xs">
            <StatusBadge status={order.status} size="md" />
            <StatusBadge status={order.paymentStatus} label={`Payment ${paymentLabel.toLowerCase()}`} size="md" />
          </Group>
        </Group>

        <Group gap="sm" mt="lg" wrap="wrap">
          <BrandButton
            component={Link}
            href={`/orders/${encoded}/track`}
            variant="outline"
            leftSection={<IconRoute size={16} aria-hidden />}
          >
            Track order
          </BrandButton>
          <BrandButton
            variant="ghost"
            onClick={handleDownload}
            loading={downloading}
            leftSection={<IconFileInvoice size={16} aria-hidden />}
          >
            Download invoice
          </BrandButton>
          {order.canCancel ? (
            <Button
              variant="subtle"
              color="danger"
              radius="xl"
              leftSection={<IconX size={16} aria-hidden />}
              onClick={() => setCancelOpen(true)}
            >
              Cancel order
            </Button>
          ) : null}
        </Group>
      </Paper>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            <OrderItemsCard items={order.items} />
            <Paper withBorder radius="md" p={{ base: "md", sm: "lg" }} bg={semantic.surface}>
              <Group gap={8} mb="md">
                <IconMapPinSearch size={18} color={semantic.iconBrand} aria-hidden />
                <Title order={2} size="h4" c={semantic.text}>
                  Order status
                </Title>
              </Group>
              <OrderTimeline
                status={order.status}
                history={order.statusHistory}
                placedAt={order.createdAt}
                shippedAt={order.shippedAt}
                deliveredAt={order.deliveredAt}
                cancelledAt={order.cancelledAt}
              />
            </Paper>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="lg">
            <SideCard icon={<IconReceipt2 size={18} color={semantic.iconBrand} aria-hidden />} title="Summary">
              <OrderTotals
                totals={{
                  itemCount,
                  subtotal: order.subtotal,
                  discountAmount: order.discountAmount,
                  deliveryFee: order.deliveryFee,
                  total: order.total,
                }}
                couponCode={order.couponCode}
              />
            </SideCard>

            <SideCard icon={<IconMapPin size={18} color={semantic.iconBrand} aria-hidden />} title="Delivery address">
              <Stack gap={2}>
                <Text size="sm" fw={600} c={semantic.text}>
                  {address.fullName}
                </Text>
                <Text size="sm" c={semantic.textSecondary}>
                  {formatBangladeshMobile(address.phone)}
                </Text>
                <Text size="sm" c={semantic.textSecondary}>
                  {address.addressLine1}
                  {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                </Text>
                <Text size="sm" c={semantic.textSecondary}>
                  {[address.city, address.district].filter(Boolean).join(", ")} {address.postalCode}
                </Text>
              </Stack>
            </SideCard>

            <SideCard icon={<IconCash size={18} color={semantic.iconBrand} aria-hidden />} title="Payment">
              <Stack gap={8}>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" c={semantic.textSecondary}>
                    {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                  </Text>
                  <StatusBadge status={order.paymentStatus} size="sm" />
                </Group>
                {order.paymentMethod === "COD" && order.paymentStatus === "UNPAID" && order.status !== "CANCELLED" ? (
                  <Text size="xs" c="dimmed">
                    Pay {formatBDT(order.total)} in cash when your order arrives.
                  </Text>
                ) : null}
              </Stack>
            </SideCard>

            <BrandButton component={Link} href="/products" variant="ghost" fullWidth>
              Continue shopping
            </BrandButton>
          </Stack>
        </Grid.Col>
      </Grid>

      <CancelOrderModal
        opened={cancelOpen}
        onClose={() => setCancelOpen(false)}
        order={order}
        onCancelled={(updated) => void mutate(updated, { revalidate: false })}
      />
    </Container>
  );
}
