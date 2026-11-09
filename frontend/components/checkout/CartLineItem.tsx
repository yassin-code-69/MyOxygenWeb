"use client";

import Link from "next/link";
import { ActionIcon, Anchor, Box, Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconCalendarTime, IconTrash } from "@tabler/icons-react";
import { ImageWithFallback } from "../ImageWithFallback";
import { Price } from "../Price";
import { maxQuantityFor } from "../../lib/cart-store";
import { formatBDT, formatMonthYear } from "../../lib/format";
import { semantic } from "../../tokens";
import type { CartItem } from "../../types/cart";
import { QuantityStepper } from "./QuantityStepper";

export interface CartLineItemProps {
  item: CartItem;
  /** Editable lines show the quantity stepper and remove button. */
  editable?: boolean;
  onQuantityChange?: (quantity: number) => void;
  onRemove?: () => void;
  /** Called when the product link is followed (e.g. to close the drawer). */
  onNavigate?: () => void;
  thumbnailSize?: number;
}

/** One cart line: thumbnail, title, unit price, FEFO expiry hint, quantity and line total. */
export function CartLineItem({
  item,
  editable = false,
  onQuantityChange,
  onRemove,
  onNavigate,
  thumbnailSize = 72,
}: CartLineItemProps) {
  const max = maxQuantityFor(item);
  const lineTotal = Math.round(item.unitPrice * 100 * item.quantity) / 100;
  const expiry = item.requiresBatchTracking ? formatMonthYear(item.earliestExpiry) : null;

  return (
    <Group align="flex-start" wrap="nowrap" gap="sm">
      <Box
        w={thumbnailSize}
        h={thumbnailSize}
        style={{
          position: "relative",
          flexShrink: 0,
          overflow: "hidden",
          borderRadius: "var(--mantine-radius-md)",
          border: `1px solid ${semantic.borderBrand}`,
          backgroundColor: semantic.surface,
        }}
      >
        <ImageWithFallback src={item.image} alt="" fill sizes={`${thumbnailSize}px`} style={{ objectFit: "contain" }} />
      </Box>

      <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          {item.slug ? (
            <Anchor
              component={Link}
              href={`/products/${item.slug}`}
              onClick={onNavigate}
              size="sm"
              fw={600}
              c={semantic.text}
              lineClamp={2}
            >
              {item.title}
            </Anchor>
          ) : (
            <Text size="sm" fw={600} c={semantic.text} lineClamp={2}>
              {item.title}
            </Text>
          )}
          {editable && onRemove ? (
            <Tooltip label="Remove">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={onRemove}
                aria-label={`Remove ${item.title} from cart`}
              >
                <IconTrash size={15} aria-hidden />
              </ActionIcon>
            </Tooltip>
          ) : null}
        </Group>

        <Group gap={6} wrap="wrap">
          <Price value={item.unitPrice} compareAt={item.originalPrice} size="sm" tone="brand" />
          {!editable ? (
            <Text size="xs" c="dimmed">
              × {item.quantity}
            </Text>
          ) : null}
        </Group>

        {expiry ? (
          <Group gap={4} wrap="nowrap">
            <IconCalendarTime size={13} color={semantic.icon} aria-hidden />
            <Text size="xs" c="dimmed">
              Earliest batch expiry {expiry}
            </Text>
          </Group>
        ) : null}

        {editable && onQuantityChange ? (
          <Group justify="space-between" align="center" wrap="nowrap" mt={2}>
            <Stack gap={2}>
              <QuantityStepper value={item.quantity} max={max} onChange={onQuantityChange} itemLabel={item.title} />
              {item.quantity >= max && typeof item.maxStock === "number" ? (
                <Text size="xs" c="dimmed">
                  Only {item.maxStock} available
                </Text>
              ) : null}
            </Stack>
            <Text size="sm" fw={700} c={semantic.text} style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatBDT(lineTotal)}
            </Text>
          </Group>
        ) : (
          <Text size="sm" fw={700} c={semantic.text} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatBDT(lineTotal)}
          </Text>
        )}
      </Stack>
    </Group>
  );
}
