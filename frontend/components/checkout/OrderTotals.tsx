"use client";

import type { ReactNode } from "react";
import { Divider, Group, Skeleton, Stack, Text, VisuallyHidden } from "@mantine/core";
import { Price } from "../Price";
import { DELIVERY_FEE, FREE_DELIVERY_THRESHOLD } from "../../lib/cart-store";
import { formatBDT } from "../../lib/format";
import { semantic } from "../../tokens";
import type { CartTotals } from "../../types/cart";

export interface OrderTotalsProps {
  totals: Pick<CartTotals, "subtotal" | "discountAmount" | "deliveryFee" | "total"> & { itemCount?: number };
  couponCode?: string | null;
  /** The coupon discount for the current cart is still being confirmed. */
  isRecalculating?: boolean;
  /** Show the delivery-fee rule under the totals. */
  showDeliveryRule?: boolean;
  size?: "sm" | "md";
}

function Row({ label, children, strong = false }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <Text size={strong ? "md" : "sm"} fw={strong ? 700 : 500} c={strong ? semantic.text : semantic.textSecondary}>
        {label}
      </Text>
      {children}
    </Group>
  );
}

/** Subtotal / coupon / delivery / total breakdown. All amounts are shown with `Price`. */
export function OrderTotals({
  totals,
  couponCode = null,
  isRecalculating = false,
  showDeliveryRule = false,
  size = "md",
}: OrderTotalsProps) {
  const itemLabel =
    typeof totals.itemCount === "number" ? ` (${totals.itemCount} ${totals.itemCount === 1 ? "item" : "items"})` : "";

  return (
    <Stack gap={10} aria-busy={isRecalculating}>
      <Row label={`Subtotal${itemLabel}`}>
        <Price value={totals.subtotal} size="sm" fw={600} />
      </Row>

      {couponCode || totals.discountAmount > 0 ? (
        <Row label={couponCode ? `Coupon (${couponCode})` : "Discount"}>
          {isRecalculating ? (
            <Group gap={6} wrap="nowrap">
              <Text size="xs" c="dimmed">
                Checking…
              </Text>
              <Skeleton h={14} w={56} radius="xl" />
            </Group>
          ) : (
            <Text component="span" size="sm" fw={600} c={semantic.textSuccess} style={{ whiteSpace: "nowrap" }}>
              <VisuallyHidden>Discount of </VisuallyHidden>
              <span aria-hidden>−</span>
              {formatBDT(totals.discountAmount)}
            </Text>
          )}
        </Row>
      ) : null}

      <Row label="Delivery">
        {totals.deliveryFee === 0 ? (
          <Text size="sm" fw={700} c={semantic.textSuccess}>
            Free
          </Text>
        ) : (
          <Price value={totals.deliveryFee} size="sm" fw={600} />
        )}
      </Row>

      <Divider color={semantic.borderBrand} />

      <Row label="Total" strong>
        {isRecalculating ? (
          <Skeleton h={22} w={88} radius="xl" />
        ) : (
          <Price value={totals.total} size={size === "md" ? "lg" : "md"} tone="brand" fw={800} />
        )}
      </Row>

      {showDeliveryRule ? (
        <Text size="xs" c="dimmed">
          Delivery is {formatBDT(DELIVERY_FEE)} on orders under {formatBDT(FREE_DELIVERY_THRESHOLD)} and free from{" "}
          {formatBDT(FREE_DELIVERY_THRESHOLD)} (before coupon discounts).
        </Text>
      ) : null}
    </Stack>
  );
}
