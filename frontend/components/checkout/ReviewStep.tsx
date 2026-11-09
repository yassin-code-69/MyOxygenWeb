"use client";

import type { ReactNode, RefObject } from "react";
import { Alert, Anchor, Box, Button, Group, List, Paper, Stack, Text, Title } from "@mantine/core";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCash,
  IconEdit,
  IconMapPin,
  IconPackage,
  IconShieldCheck,
} from "@tabler/icons-react";
import { BrandButton } from "../BrandButton";
import { CartLineItem } from "./CartLineItem";
import { OrderTotals } from "./OrderTotals";
import { formatBDT } from "../../lib/format";
import { formatBangladeshMobile } from "../../lib/phone";
import { semantic } from "../../tokens";
import type { CartItem, CartTotals } from "../../types/cart";
import type { ShippingAddress } from "../../types/order";
import type { CheckoutProblem } from "../../hooks/checkout/use-place-order";

export interface ReviewStepProps {
  items: CartItem[];
  address: ShippingAddress | null;
  totals: CartTotals;
  couponCode: string | null;
  isRecalculating: boolean;
  /** Blocks submission while the coupon preview is being re-checked or failed. */
  couponBlocked: boolean;
  /** Live catalog prices are still being fetched. */
  isRefreshingPrices: boolean;
  problem: CheckoutProblem | null;
  isPlacing: boolean;
  onEditShipping: () => void;
  onEditPayment: () => void;
  onBack: () => void;
  onPlaceOrder: () => void;
  onAdjustQuantity: (productId: string, available: number) => void;
  onRemoveItem: (productId: string) => void;
  onRemoveCoupon: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

function SectionCard({
  icon,
  title,
  onEdit,
  editLabel,
  children,
}: {
  icon: ReactNode;
  title: string;
  onEdit?: () => void;
  editLabel?: string;
  children: ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="md" bg={semantic.surface}>
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap={8} wrap="nowrap">
          {icon}
          <Title order={3} size="h5" c={semantic.text}>
            {title}
          </Title>
        </Group>
        {onEdit ? (
          <Button
            variant="subtle"
            color="primaryPink"
            size="compact-sm"
            leftSection={<IconEdit size={14} aria-hidden />}
            onClick={onEdit}
            aria-label={editLabel}
          >
            Edit
          </Button>
        ) : null}
      </Group>
      {children}
    </Paper>
  );
}

function ProblemAlert({
  problem,
  items,
  onAdjustQuantity,
  onRemoveItem,
  onEditShipping,
}: Pick<ReviewStepProps, "items" | "onAdjustQuantity" | "onRemoveItem" | "onEditShipping"> & {
  problem: CheckoutProblem;
}) {
  switch (problem.kind) {
    case "insufficient-stock": {
      const item = items.find((line) => line.id.toLowerCase() === problem.productId.toLowerCase());
      const title = item?.title ?? "One of your items";
      return (
        <Alert color="warning" variant="light" radius="md" icon={<IconAlertCircle size={18} />} title="Not enough stock">
          <Stack gap="xs">
            <Text size="sm">
              {problem.available > 0
                ? `Only ${problem.available} of “${title}” ${problem.available === 1 ? "is" : "are"} left (you asked for ${problem.requested}).`
                : `“${title}” has just sold out.`}
            </Text>
            {item ? (
              <Group gap="xs">
                {problem.available > 0 ? (
                  <Button size="xs" color="primaryPink" onClick={() => onAdjustQuantity(item.id, problem.available)}>
                    Change quantity to {problem.available}
                  </Button>
                ) : null}
                <Button size="xs" variant="light" color="gray" onClick={() => onRemoveItem(item.id)}>
                  Remove from cart
                </Button>
              </Group>
            ) : null}
          </Stack>
        </Alert>
      );
    }
    case "unavailable":
      return (
        <Alert color="warning" variant="light" radius="md" icon={<IconAlertCircle size={18} />} title="Your cart was updated">
          {problem.message}. We removed the unavailable items — please review your order and place it again.
        </Alert>
      );
    case "invalid-coupon":
      return (
        <Alert color="warning" variant="light" radius="md" icon={<IconAlertCircle size={18} />} title="Coupon removed">
          {problem.message} Your total has been updated without the coupon.
        </Alert>
      );
    case "validation":
      return (
        <Alert color="danger" variant="light" radius="md" icon={<IconAlertCircle size={18} />} title="Please check your details">
          <Stack gap={6}>
            {problem.messages.length > 0 ? (
              <List size="sm" spacing={2}>
                {problem.messages.map((message) => (
                  <List.Item key={message}>{message}</List.Item>
                ))}
              </List>
            ) : (
              <Text size="sm">{problem.message}</Text>
            )}
            <Anchor component="button" type="button" size="sm" onClick={onEditShipping}>
              Edit delivery address
            </Anchor>
          </Stack>
        </Alert>
      );
    case "unauthorized":
    case "other":
    default:
      return (
        <Alert color="danger" variant="light" radius="md" icon={<IconAlertCircle size={18} />} title="Order not placed">
          {problem.message}
        </Alert>
      );
  }
}

/** Step 3 — review everything and place the order. */
export function ReviewStep({
  items,
  address,
  totals,
  couponCode,
  isRecalculating,
  couponBlocked,
  isRefreshingPrices,
  problem,
  isPlacing,
  onEditShipping,
  onEditPayment,
  onBack,
  onPlaceOrder,
  onAdjustQuantity,
  onRemoveItem,
  onRemoveCoupon,
  headingRef,
}: ReviewStepProps) {
  const canPlace = items.length > 0 && address !== null && !couponBlocked && !isRefreshingPrices && !isPlacing;

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2} id="checkout-review-heading" ref={headingRef} tabIndex={-1} size="h3" c={semantic.text}>
          Review your order
        </Title>
        <Text size="sm" c="dimmed">
          Check the details below, then place your order.
        </Text>
      </Stack>

      <Box role="alert" aria-live="assertive">
        {problem ? (
          <ProblemAlert
            problem={problem}
            items={items}
            onAdjustQuantity={onAdjustQuantity}
            onRemoveItem={onRemoveItem}
            onEditShipping={onEditShipping}
          />
        ) : null}
      </Box>

      <SectionCard
        icon={<IconPackage size={18} color={semantic.iconBrand} aria-hidden />}
        title={`Items (${totals.itemCount})`}
      >
        <Stack gap="sm" component="ul" m={0} p={0} style={{ listStyle: "none" }}>
          {items.map((item) => (
            <Box component="li" key={item.id}>
              <CartLineItem item={item} thumbnailSize={56} />
            </Box>
          ))}
        </Stack>
      </SectionCard>

      <SectionCard
        icon={<IconMapPin size={18} color={semantic.iconBrand} aria-hidden />}
        title="Deliver to"
        onEdit={onEditShipping}
        editLabel="Edit delivery address"
      >
        {address ? (
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
              {address.city}, {address.district} {address.postalCode}
            </Text>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            Add your delivery address first.
          </Text>
        )}
      </SectionCard>

      <SectionCard
        icon={<IconCash size={18} color={semantic.iconBrand} aria-hidden />}
        title="Payment"
        onEdit={onEditPayment}
        editLabel="Change payment method"
      >
        <Text size="sm" c={semantic.textSecondary}>
          Cash on delivery — pay {formatBDT(totals.total)} to the courier when your order arrives.
        </Text>
      </SectionCard>

      <Paper withBorder radius="md" p="md" bg={semantic.surface}>
        <OrderTotals
          totals={totals}
          couponCode={couponCode}
          isRecalculating={isRecalculating}
          showDeliveryRule
        />
        {couponBlocked && !isRecalculating && couponCode ? (
          <Alert mt="md" color="warning" variant="light" radius="md" icon={<IconAlertCircle size={18} />}>
            <Text size="sm">
              We couldn&apos;t confirm coupon {couponCode} for this cart.{" "}
              <Anchor component="button" type="button" size="sm" onClick={onRemoveCoupon}>
                Remove it
              </Anchor>{" "}
              or try again in a moment.
            </Text>
          </Alert>
        ) : null}
      </Paper>

      <Stack gap="xs">
        <BrandButton
          size="lg"
          fullWidth
          onClick={onPlaceOrder}
          loading={isPlacing}
          disabled={!canPlace}
          leftSection={<IconShieldCheck size={20} aria-hidden />}
        >
          {isRecalculating || isRefreshingPrices ? "Updating total…" : `Place order (${formatBDT(totals.total)})`}
        </BrandButton>
        <Group justify="space-between" wrap="wrap" gap="xs">
          <BrandButton variant="ghost" onClick={onBack} leftSection={<IconArrowLeft size={18} aria-hidden />}>
            Back
          </BrandButton>
          <Text size="xs" c="dimmed">
            Prices, stock and coupons are confirmed again when you place the order.
          </Text>
        </Group>
      </Stack>
    </Stack>
  );
}
