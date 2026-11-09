"use client";

import Link from "next/link";
import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import {
  IconBolt,
  IconCalculator,
  IconDiscount,
  IconExternalLink,
  IconFileSpreadsheet,
  IconPackageImport,
  IconPencil,
  IconReceipt2,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ImageWithFallback } from "../../ImageWithFallback";
import { StatusBadge } from "../../StatusBadge";
import { useAdminProduct } from "../../../hooks/admin/use-admin-products";
import { useCan } from "../../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../../types/auth";
import { ADMIN_COST_COMPONENTS, type AdminProductDTO } from "../../../types/admin";
import { formatCalendarDate, formatCount, formatDhakaDateTime, formatMoney, formatPercent } from "../format";
import { Thumb } from "../kit";
import { LISTING_STATUS_HELP, ListingStatusBadge } from "../ListingStatusBadge";
import { QueryError } from "../QueryError";
import { COST_COMPONENT_LABELS, landedCost, marginColor, marginPercent } from "./pricing";

export interface ProductDetailDrawerProps {
  productId: string | null;
  onClose: () => void;
  onEdit?: (product: AdminProductDTO) => void;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Text size="xs" c="var(--mo-color-text-secondary)" fw={600} tt="uppercase" style={{ letterSpacing: "0.04em" }}>
        {label}
      </Text>
      <Box mt={2}>{typeof children === "string" ? <Text size="sm">{children}</Text> : children}</Box>
    </Box>
  );
}

function AmountRow({ label, value, strong = false, tone }: { label: ReactNode; value: string; strong?: boolean; tone?: string }) {
  return (
    <Group justify="space-between" gap="sm" wrap="nowrap" py={3}>
      <Text size="sm" c={strong ? "var(--mo-color-text)" : "var(--mo-color-text-secondary)"} fw={strong ? 700 : 400}>
        {label}
      </Text>
      <Text size="sm" fw={strong ? 700 : 500} c={tone ?? "var(--mo-color-text)"} className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
        {value}
      </Text>
    </Group>
  );
}

function CardTitle({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <Group gap={6} mb="xs" wrap="nowrap">
      {icon}
      <Text size="sm" fw={600} c="var(--mo-color-text)">
        {children}
      </Text>
    </Group>
  );
}

/** Mockup "Cost breakdown (per unit)" + "Selling price & profit" cards. */
function PricingCards({ product }: { product: AdminProductDTO }) {
  const breakdown = product.costBreakdown ?? null;
  const cost = breakdown ? landedCost(breakdown) : product.costPrice;
  const discount = product.basePrice - product.effectivePrice;
  const profit = product.effectivePrice - cost;
  const margin = marginPercent(product.effectivePrice, cost);
  const color = marginColor(margin);

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <Paper withBorder radius="md" p="md">
        <CardTitle icon={<IconCalculator size={16} color="var(--mo-color-secondary-8)" aria-hidden />}>Cost breakdown (per unit)</CardTitle>
        {breakdown ? (
          <>
            {ADMIN_COST_COMPONENTS.map((key) => (
              <AmountRow key={key} label={COST_COMPONENT_LABELS[key]} value={formatMoney(breakdown[key])} />
            ))}
          </>
        ) : (
          <Text size="xs" c="var(--mo-color-text-secondary)" mb={6}>
            Not itemised. Edit the product to split the landed cost into supplier price, shipping, customs, packaging and
            other costs.
          </Text>
        )}
        <Divider my={6} color="var(--mo-color-border-subtle)" />
        <AmountRow label="Total cost (landed)" value={formatMoney(cost)} strong />
      </Paper>
      <Paper withBorder radius="md" p="md">
        <CardTitle icon={<IconReceipt2 size={16} color="var(--mo-color-secondary-8)" aria-hidden />}>Selling price & profit</CardTitle>
        <AmountRow label="Base price" value={formatMoney(product.basePrice)} />
        <AmountRow
          label={product.activeDiscount ? (product.activeDiscount.isFlashSale ? "Flash sale discount" : "Discount") : "Discount"}
          value={discount > 0 ? `−${formatMoney(discount)}` : formatMoney(0)}
        />
        <AmountRow label="Selling price today" value={formatMoney(product.effectivePrice)} strong />
        <AmountRow
          label="Profit per unit"
          value={`${profit < 0 ? "−" : ""}${formatMoney(Math.abs(profit))}`}
          tone={profit < 0 ? "var(--mo-color-text-danger)" : "var(--mo-color-text-success)"}
        />
        <Group
          justify="space-between"
          mt={8}
          px="sm"
          py={6}
          style={{ borderRadius: "var(--mo-radius-sm)", backgroundColor: `var(--mantine-color-${color}-0)` }}
        >
          <Text size="sm" fw={600} c={`var(--mantine-color-${color}-9)`}>
            Margin
          </Text>
          <Text fw={700} c={`var(--mantine-color-${color}-9)`} className="mo-tabular-nums">
            {formatPercent(margin)}
          </Text>
        </Group>
      </Paper>
    </SimpleGrid>
  );
}

/** Product facts, pricing & landed cost, and every batch (`GET /admin/catalog/products/:id`). */
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
        <Stack gap="md" aria-busy>
          <Group gap="md" wrap="nowrap">
            <Skeleton height={72} width={72} radius="md" />
            <Stack gap={8} style={{ flex: 1 }}>
              <Skeleton height={14} width={140} radius="xl" />
              <Skeleton height={24} width="70%" />
              <Skeleton height={12} width="40%" radius="xl" />
            </Stack>
          </Group>
          <Group gap="sm">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} height={30} width={120} radius="xl" />
            ))}
          </Group>
          <SimpleGrid cols={2} spacing="md">
            <Skeleton height={210} radius="md" />
            <Skeleton height={210} radius="md" />
          </SimpleGrid>
          <Skeleton height={140} radius="md" />
          <Skeleton height={220} radius="md" />
        </Stack>
      ) : null}

      {error && !product ? <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.PRODUCTS_READ} /> : null}

      {product ? (
        <Stack gap="lg">
          <Group gap="md" wrap="nowrap" align="flex-start">
            <Thumb src={product.images[0]} size={72} alt={product.title} />
            <Box style={{ minWidth: 0, overflowWrap: "anywhere" }}>
              <Group gap="xs" mb={6}>
                <ListingStatusBadge status={product.listingStatus} />
                {product.activeDiscount ? (
                  <Badge
                    variant="light"
                    radius="xl"
                    tt="none"
                    color={product.activeDiscount.isFlashSale ? "accentPurple" : "primaryPink"}
                    leftSection={product.activeDiscount.isFlashSale ? <IconBolt size={12} aria-hidden /> : <IconDiscount size={12} aria-hidden />}
                  >
                    {product.activeDiscount.isFlashSale ? "Flash sale" : "Discount"} −{Math.round(product.discountPercent)}%
                  </Badge>
                ) : null}
              </Group>
              <Title order={2} fz={20} lh={1.3}>
                {product.title}
              </Title>
              <Text size="sm" c="var(--mo-color-text-secondary)">
                <Text component="span" inherit ff="var(--mo-font-monospace)">
                  {product.sku}
                </Text>{" "}
                · {product.category.name}
                {product.brand ? ` · ${product.brand}` : ""}
              </Text>
            </Box>
          </Group>
          <Text size="sm" c="var(--mo-color-text-secondary)" mt={-8}>
            {LISTING_STATUS_HELP[product.listingStatus]}
          </Text>

          <Group gap="sm" wrap="wrap">
            {canWrite && onEdit ? (
              <Button size="xs" radius="xl" variant="light" color="secondaryGreen" leftSection={<IconPencil size={14} aria-hidden />} onClick={() => onEdit(product)}>
                Edit product
              </Button>
            ) : null}
            {canBatches ? (
              <Button
                size="xs"
                radius="xl"
                variant="light"
                color="info"
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
                radius="xl"
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
                radius="xl"
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
                radius="xl"
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

          <PricingCards product={product} />

          {product.images.length > 1 ? (
            <ScrollArea type="auto" offsetScrollbars>
              <Group gap="sm" wrap="nowrap">
                {product.images.map((src, index) => (
                  <Box
                    key={src}
                    w={80}
                    h={80}
                    style={{
                      position: "relative",
                      flexShrink: 0,
                      borderRadius: "var(--mo-radius-md)",
                      overflow: "hidden",
                      border: "1px solid var(--mo-color-border-subtle)",
                    }}
                  >
                    <ImageWithFallback src={src} alt={`${product.title} image ${index + 1}`} fill sizes="80px" style={{ objectFit: "cover" }} />
                  </Box>
                ))}
              </Group>
            </ScrollArea>
          ) : null}

          <Paper withBorder radius="md" p="md">
            <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md" verticalSpacing="md">
              <Fact label="Stock">
                <Group gap={6}>
                  <Text size="sm" fw={700} className="mo-tabular-nums">
                    {formatCount(product.totalStock)}
                  </Text>
                  {product.isOutOfStock ? <StatusBadge status="OUT_OF_STOCK" size="xs" /> : null}
                  {!product.isOutOfStock && product.isLowStock ? <StatusBadge status="LOW_STOCK" size="xs" /> : null}
                </Group>
              </Fact>
              <Fact label="Low-stock alert at">{formatCount(product.lowStockThreshold)}</Fact>
              <Fact label="Batch tracking">{product.requiresBatchTracking ? "On (FEFO)" : "Off"}</Fact>
              <Fact label="Earliest expiry">{product.earliestExpiry ? formatCalendarDate(product.earliestExpiry) : "—"}</Fact>
              <Fact label="Created">{formatDhakaDateTime(product.createdAt)}</Fact>
              <Fact label="Updated">{formatDhakaDateTime(product.updatedAt)}</Fact>
            </SimpleGrid>
          </Paper>

          {product.autoDeactivatedAt ? (
            <Alert color="warning" variant="light" radius="md">
              Hidden automatically on {formatDhakaDateTime(product.autoDeactivatedAt)} when stock ran out.
            </Alert>
          ) : null}

          <Box>
            <Text fw={600} mb={6}>
              Description
            </Text>
            {/* overflow-wrap: anywhere — a long unbroken word or URL must wrap, never widen the drawer. */}
            <Text size="sm" c="var(--mo-color-text-secondary)" style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
              {product.description}
            </Text>
          </Box>

          <Box>
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Batches ({formatCount(product.batches.length)})</Text>
              {canBatches && product.batches.length > 0 ? (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="secondaryGreen"
                  component={Link}
                  href={`/admin/batches?productId=${product.id}`}
                >
                  Open in Batch Inspector
                </Button>
              ) : null}
            </Group>
            {product.batches.length === 0 ? (
              <Text size="sm" c="var(--mo-color-text-secondary)">
                No batches yet. {canBatches ? "Import one to put this product on sale." : ""}
              </Text>
            ) : (
              <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
                <Table.ScrollContainer minWidth={520} type="native">
                  <Table verticalSpacing="xs" horizontalSpacing="md" aria-label={`Batches of ${product.title}`}>
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
                            <Text size="xs" c="var(--mo-color-text-muted)">
                              Made {batch.manufactureDate ? formatCalendarDate(batch.manufactureDate) : "—"}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{formatCalendarDate(batch.expiryDate)}</Text>
                            <Text size="xs" c="var(--mo-color-text-muted)">
                              {batch.daysUntilExpiry > 0 ? `${formatCount(batch.daysUntilExpiry)} days left` : "Expired"}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right" className="mo-tabular-nums">
                            <Text size="sm" fw={600}>
                              {formatCount(batch.availableQuantity)}
                            </Text>
                            <Text size="xs" c="var(--mo-color-text-muted)">
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
              </Paper>
            )}
          </Box>
        </Stack>
      ) : null}
    </Drawer>
  );
}
