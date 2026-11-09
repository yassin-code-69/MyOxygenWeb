"use client";

import Link from "next/link";
import { Anchor, Badge, Box, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconBarcode, IconCalendarTime, IconPackage } from "@tabler/icons-react";
import { ImageWithFallback } from "../ImageWithFallback";
import { formatBDT, formatDayMonthYear } from "../../lib/format";
import { semantic } from "../../tokens";
import type { OrderDetailItemDTO } from "../../types/order";

interface ProductGroup {
  productId: string;
  title: string;
  slug: string | null;
  sku: string | null;
  image: string | null;
  unitPrice: number;
  quantity: number;
  total: number;
  batches: { id: string; batchNumber: string | null; expiry: string | null; quantity: number }[];
}

/** The API returns one row per batch; group them back into one line per product. */
export function groupOrderItems(items: readonly OrderDetailItemDTO[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const item of items) {
    const group = groups.get(item.productId) ?? {
      productId: item.productId,
      title: item.productTitle,
      slug: item.productSlug,
      sku: item.productSku,
      image: item.productImage,
      unitPrice: item.unitPrice,
      quantity: 0,
      total: 0,
      batches: [],
    };
    group.quantity += item.quantity;
    group.total = Math.round(group.total * 100 + item.totalPrice * 100) / 100;
    group.batches.push({ id: item.id, batchNumber: item.batchNumber, expiry: item.batchExpiryDate, quantity: item.quantity });
    groups.set(item.productId, group);
  }
  return [...groups.values()];
}

export interface OrderItemsCardProps {
  items: readonly OrderDetailItemDTO[];
}

/** Ordered products with the exact batch (and expiry) each unit was taken from. */
export function OrderItemsCard({ items }: OrderItemsCardProps) {
  const groups = groupOrderItems(items);
  const units = groups.reduce((sum, group) => sum + group.quantity, 0);

  return (
    <Paper withBorder radius="md" p={{ base: "md", sm: "lg" }} bg={semantic.surface}>
      <Group gap={8} mb="md">
        <IconPackage size={18} color={semantic.iconBrand} aria-hidden />
        <Title order={2} size="h4" c={semantic.text}>
          Items ({units})
        </Title>
      </Group>
      <Stack gap={0} component="ul" m={0} p={0} style={{ listStyle: "none" }}>
        {groups.map((group, index) => (
          <Box
            component="li"
            key={group.productId}
            py="md"
            style={{ borderTop: index === 0 ? undefined : `1px solid ${semantic.borderBrand}` }}
          >
            <Group align="flex-start" wrap="nowrap" gap="md">
              <Box
                w={64}
                h={64}
                style={{
                  position: "relative",
                  flexShrink: 0,
                  overflow: "hidden",
                  borderRadius: "var(--mantine-radius-md)",
                  border: `1px solid ${semantic.borderBrand}`,
                }}
              >
                <ImageWithFallback src={group.image} alt="" fill sizes="64px" style={{ objectFit: "contain" }} />
              </Box>
              <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    {group.slug ? (
                      <Anchor component={Link} href={`/products/${group.slug}`} fw={600} size="sm" c={semantic.text}>
                        {group.title}
                      </Anchor>
                    ) : (
                      <Text fw={600} size="sm" c={semantic.text}>
                        {group.title}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed">
                      {group.quantity} × {formatBDT(group.unitPrice)}
                      {group.sku ? ` · SKU ${group.sku}` : ""}
                    </Text>
                  </Stack>
                  <Text fw={700} size="sm" c={semantic.text} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatBDT(group.total)}
                  </Text>
                </Group>
                {group.batches.some((batch) => batch.batchNumber) ? (
                  <Stack gap={4} aria-label={`Batches for ${group.title}`}>
                    {group.batches.map((batch) =>
                      batch.batchNumber ? (
                        <Group key={batch.id} gap={8} wrap="wrap">
                          <Badge
                            variant="light"
                            color="secondaryGreen"
                            size="sm"
                            tt="none"
                            leftSection={<IconBarcode size={12} aria-hidden />}
                          >
                            Batch {batch.batchNumber}
                          </Badge>
                          {batch.expiry ? (
                            <Group gap={4} wrap="nowrap">
                              <IconCalendarTime size={13} color={semantic.icon} aria-hidden />
                              <Text size="xs" c={semantic.textSecondary}>
                                Expires {formatDayMonthYear(batch.expiry)}
                              </Text>
                            </Group>
                          ) : null}
                          {group.batches.length > 1 ? (
                            <Text size="xs" c="dimmed">
                              × {batch.quantity}
                            </Text>
                          ) : null}
                        </Group>
                      ) : null
                    )}
                  </Stack>
                ) : null}
              </Stack>
            </Group>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
