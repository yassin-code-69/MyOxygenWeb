"use client";

import Link from "next/link";
import {
  Alert,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconDiscount, IconExternalLink, IconFileSpreadsheet, IconPackageImport, IconPencil } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ImageWithFallback } from "../../ImageWithFallback";
import { StatusBadge } from "../../StatusBadge";
import { useAdminProduct } from "../../../hooks/admin/use-admin-products";
import { useCan } from "../../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../../types/auth";
import type { AdminProductDTO } from "../../../types/admin";
import { formatCalendarDate, formatCount, formatDhakaDateTime, formatMoney } from "../format";
import { LISTING_STATUS_HELP, ListingStatusBadge } from "../ListingStatusBadge";
import { QueryError } from "../QueryError";

export interface ProductDetailDrawerProps {
  productId: string | null;
  onClose: () => void;
  onEdit?: (product: AdminProductDTO) => void;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.04em" }}>
        {label}
      </Text>
      <Box mt={2}>{typeof children === "string" ? <Text size="sm">{children}</Text> : children}</Box>
    </Box>
  );
}

/** Product facts, pricing and every batch (`GET /admin/catalog/products/:id`). */
export function ProductDetailDrawer({ productId, onClose, onEdit }: ProductDetailDrawerProps) {
  const { data: product, error, isLoading, mutate } = useAdminProduct(productId);
  const canWrite = useCan(PERMISSIONS.PRODUCTS_WRITE);
  const canBatches = useCan(PERMISSIONS.BATCHES_MANAGE);
  const canLedger = useCan(PERMISSIONS.STOCK_ADJUST);
  const canDiscounts = useCan(PERMISSIONS.DISCOUNTS_MANAGE);

  return (
    <Drawer
      opened={productId !== null}
      onClose={onClose}
      position="right"
      size="xl"
      title={<Text fw={700}>Product details</Text>}
      scrollAreaComponent={ScrollArea.Autosize}
    >
      {isLoading && !product ? (
        <Stack gap="md">
          <Skeleton height={28} width="70%" />
          <Skeleton height={14} width="40%" radius="xl" />
          <Group gap="sm">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} height={88} width={88} radius="md" />
            ))}
          </Group>
          <Skeleton height={140} radius="md" />
          <Skeleton height={220} radius="md" />
        </Stack>
      ) : null}

      {error && !product ? <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.PRODUCTS_READ} /> : null}

      {product ? (
        <Stack gap="lg">
          <Box>
            <Group gap="xs" mb={6}>
              <ListingStatusBadge status={product.listingStatus} />
              {product.activeDiscount ? (
                <Badge variant="light" color={product.activeDiscount.isFlashSale ? "accentPurple" : "primaryPink"} leftSection={<IconDiscount size={12} aria-hidden />}>
                  {product.activeDiscount.isFlashSale ? "Flash sale" : "Discount"} −{product.discountPercent}%
                </Badge>
              ) : null}
            </Group>
            <Title order={2} fz={22}>
              {product.title}
            </Title>
            <Text size="sm" c="dimmed" ff="var(--mo-font-monospace)">
              {product.sku}
            </Text>
            <Text size="sm" c="dimmed" mt={6}>
              {LISTING_STATUS_HELP[product.listingStatus]}
            </Text>
          </Box>

          <Group gap="sm" wrap="wrap">
            {canWrite && onEdit ? (
              <Button size="xs" variant="light" leftSection={<IconPencil size={14} aria-hidden />} onClick={() => onEdit(product)}>
                Edit product
              </Button>
            ) : null}
            {canBatches ? (
              <Button
                size="xs"
                variant="light"
                color="secondaryGreen"
                component={Link}
                href={`/admin/batches?import=${product.id}`}
                leftSection={<IconPackageImport size={14} aria-hidden />}
              >
                Import batch
              </Button>
            ) : null}
            {canLedger ? (
              <Button
                size="xs"
                variant="default"
                component={Link}
                href={`/admin/ledger?productId=${product.id}`}
                leftSection={<IconFileSpreadsheet size={14} aria-hidden />}
              >
                Stock history
              </Button>
            ) : null}
            {canDiscounts ? (
              <Button
                size="xs"
                variant="default"
                component={Link}
                href={`/admin/discounts?new=automatic&productId=${product.id}`}
                leftSection={<IconDiscount size={14} aria-hidden />}
              >
                Create discount
              </Button>
            ) : null}
            {product.listingStatus === "ACTIVE" ? (
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                component="a"
                href={`/products/${product.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                rightSection={<IconExternalLink size={14} aria-hidden />}
              >
                View on store
              </Button>
            ) : null}
          </Group>

          {product.images.length > 0 ? (
            <ScrollArea type="auto" offsetScrollbars>
              <Group gap="sm" wrap="nowrap">
                {product.images.map((src, index) => (
                  <Box
                    key={src}
                    w={88}
                    h={88}
                    style={{ position: "relative", flexShrink: 0, borderRadius: "var(--mo-radius-md)", overflow: "hidden", border: "1px solid var(--mo-color-border-subtle)" }}
                  >
                    <ImageWithFallback src={src} alt={`${product.title} image ${index + 1}`} fill sizes="88px" style={{ objectFit: "cover" }} />
                  </Box>
                ))}
              </Group>
            </ScrollArea>
          ) : (
            <Text size="sm" c="dimmed">
              No images yet.
            </Text>
          )}

          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md" verticalSpacing="md">
            <Fact label="Category">{product.category.name}</Fact>
            <Fact label="Brand">{product.brand ?? "—"}</Fact>
            <Fact label="Selling price">
              <Text size="sm" fw={600} className="mo-tabular-nums">
                {formatMoney(product.effectivePrice)}
                {product.effectivePrice < product.basePrice ? (
                  <Text component="span" size="xs" c="dimmed" td="line-through" ml={6}>
                    {formatMoney(product.basePrice)}
                  </Text>
                ) : null}
              </Text>
            </Fact>
            <Fact label="Cost price">
              <Text size="sm" className="mo-tabular-nums">
                {formatMoney(product.costPrice)}
              </Text>
            </Fact>
            <Fact label="Stock">
              <Group gap={6}>
                <Text size="sm" fw={600} className="mo-tabular-nums">
                  {formatCount(product.totalStock)}
                </Text>
                {product.isOutOfStock ? <StatusBadge status="OUT_OF_STOCK" size="xs" /> : null}
                {!product.isOutOfStock && product.isLowStock ? <StatusBadge status="LOW_STOCK" size="xs" /> : null}
              </Group>
            </Fact>
            <Fact label="Low-stock alert at">{formatCount(product.lowStockThreshold)}</Fact>
            <Fact label="Batch tracking">{product.requiresBatchTracking ? "On (FEFO)" : "Off"}</Fact>
            <Fact label="Earliest expiry">{product.earliestExpiry ? formatCalendarDate(product.earliestExpiry) : "—"}</Fact>
            <Fact label="Updated">{formatDhakaDateTime(product.updatedAt)}</Fact>
          </SimpleGrid>

          {product.autoDeactivatedAt ? (
            <Alert color="warning" variant="light" radius="md">
              Hidden automatically on {formatDhakaDateTime(product.autoDeactivatedAt)} when stock ran out.
            </Alert>
          ) : null}

          <Box>
            <Text fw={600} mb={6}>
              Description
            </Text>
            <Text size="sm" c="var(--mo-color-text-secondary)" style={{ whiteSpace: "pre-line" }}>
              {product.description}
            </Text>
          </Box>

          <Box>
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Batches ({formatCount(product.batches.length)})</Text>
            </Group>
            {product.batches.length === 0 ? (
              <Text size="sm" c="dimmed">
                No batches yet. {canBatches ? "Import one to put this product on sale." : ""}
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={560} type="native">
                <Table verticalSpacing="xs" aria-label={`Batches of ${product.title}`}>
                  <Table.Thead bg="var(--mo-color-surface-muted)">
                    <Table.Tr>
                      <Table.Th scope="col">Batch</Table.Th>
                      <Table.Th scope="col">Expiry</Table.Th>
                      <Table.Th scope="col" ta="right">
                        Available
                      </Table.Th>
                      <Table.Th scope="col">Health</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {product.batches.map((batch) => (
                      <Table.Tr key={batch.id}>
                        <Table.Td>
                          <Text size="sm" fw={600} ff="var(--mo-font-monospace)">
                            {batch.batchNumber}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Made {batch.manufactureDate ? formatCalendarDate(batch.manufactureDate) : "—"}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{formatCalendarDate(batch.expiryDate)}</Text>
                          <Text size="xs" c="dimmed">
                            {batch.daysUntilExpiry > 0 ? `${formatCount(batch.daysUntilExpiry)} days left` : "Expired"}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right" className="mo-tabular-nums">
                          <Text size="sm" fw={600}>
                            {formatCount(batch.availableQuantity)}
                          </Text>
                          <Text size="xs" c="dimmed">
                            of {formatCount(batch.initialQuantity)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <StatusBadge status={batch.healthStatus} size="sm" />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Box>
        </Stack>
      ) : null}
    </Drawer>
  );
}
