"use client";

import Link from "next/link";
import { Anchor, Avatar, Box, Card, Group, Skeleton, Stack, Text, Tooltip } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { BrandButton } from "../BrandButton";
import { ImageWithFallback } from "../ImageWithFallback";
import { Price } from "../Price";
import { StatusBadge } from "../StatusBadge";
import { semantic } from "../../tokens";
import type { OrderSummaryDTO } from "../../types/order";
import { formatDhakaDate, PAYMENT_METHOD_LABEL } from "./order-format";

const MAX_THUMBNAILS = 4;

export interface OrderCardProps {
  order: OrderSummaryDTO;
}

/** Summary card for one order in "My orders". */
export function OrderCard({ order }: OrderCardProps) {
  const href = `/orders/${encodeURIComponent(order.orderNumber)}`;
  const placed = formatDhakaDate(order.createdAt);
  const shown = order.items.slice(0, MAX_THUMBNAILS);
  const hidden = order.items.length - shown.length;
  const headingId = `order-${order.id}-heading`;

  return (
    <Card withBorder radius="md" padding="lg" bg={semantic.surface} component="article" aria-labelledby={headingId}>
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap={2}>
          <Anchor
            component={Link}
            href={href}
            id={headingId}
            fw={700}
            c={semantic.text}
            ff="monospace"
            size="sm"
          >
            {order.orderNumber}
          </Anchor>
          {placed ? (
            <Text size="xs" c="dimmed">
              Placed <time dateTime={order.createdAt}>{placed}</time>
            </Text>
          ) : null}
        </Stack>
        <StatusBadge status={order.status} />
      </Group>

      <Group justify="space-between" align="center" mt="md" wrap="wrap" gap="md">
        <Group gap="sm" wrap="nowrap">
          <Avatar.Group spacing="sm">
            {shown.map((item) => (
              <Tooltip key={item.productId} label={`${item.productTitle} × ${item.quantity}`}>
                <Avatar size={44} radius="md" bg={semantic.surface} style={{ border: `1px solid ${semantic.borderBrand}` }}>
                  <Box pos="relative" w={44} h={44}>
                    <ImageWithFallback
                      src={item.productImage}
                      alt={item.productTitle}
                      fill
                      sizes="44px"
                      style={{ objectFit: "contain" }}
                    />
                  </Box>
                </Avatar>
              </Tooltip>
            ))}
            {hidden > 0 ? (
              <Avatar size={44} radius="md" color="primaryPink" aria-label={`${hidden} more products`}>
                +{hidden}
              </Avatar>
            ) : null}
          </Avatar.Group>
          <Stack gap={0}>
            <Text size="sm" fw={600} c={semantic.text}>
              {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
            </Text>
            <Text size="xs" c="dimmed">
              {PAYMENT_METHOD_LABEL[order.paymentMethod]}
            </Text>
          </Stack>
        </Group>

        <Group gap="md" wrap="nowrap">
          <Stack gap={0} align="flex-end">
            <Text size="xs" c="dimmed">
              Total
            </Text>
            <Price value={order.total} tone="brand" size="md" fw={800} />
          </Stack>
          <BrandButton
            component={Link}
            href={href}
            variant="outline"
            size="sm"
            rightSection={<IconChevronRight size={16} aria-hidden />}
            aria-label={`View details of order ${order.orderNumber}`}
          >
            Details
          </BrandButton>
        </Group>
      </Group>
    </Card>
  );
}

/** Same footprint as `OrderCard`. */
export function OrderCardSkeleton() {
  return (
    <Card withBorder radius="md" padding="lg" bg={semantic.surface} aria-hidden>
      <Group justify="space-between" align="flex-start">
        <Stack gap={6}>
          <Skeleton h={14} w={190} radius="xl" />
          <Skeleton h={10} w={110} radius="xl" />
        </Stack>
        <Skeleton h={22} w={86} radius="xl" />
      </Group>
      <Group justify="space-between" mt="md">
        <Group gap="sm" wrap="nowrap">
          <Group gap={4} wrap="nowrap">
            {[0, 1, 2].map((thumb) => (
              <Skeleton key={thumb} w={44} h={44} radius="md" />
            ))}
          </Group>
          <Stack gap={6}>
            <Skeleton h={12} w={60} radius="xl" />
            <Skeleton h={10} w={100} radius="xl" />
          </Stack>
        </Group>
        <Group gap="md" wrap="nowrap">
          <Skeleton h={24} w={80} radius="xl" />
          <Skeleton h={30} w={96} radius="xl" />
        </Group>
      </Group>
    </Card>
  );
}
