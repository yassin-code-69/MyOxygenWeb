"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Anchor, Badge, List, Stack, Table, Tabs, Text, ThemeIcon } from "@mantine/core";
import { IconCalendarTime, IconCash, IconReceiptRefund, IconTruckDelivery, IconX } from "@tabler/icons-react";
import { formatBDT, formatDayMonthYear } from "../../lib/format";
import type { CatalogProductDetailDTO } from "../../types/catalog";
import classes from "./ProductDetail.module.css";

/** Delivery rule from docs/API_CONTRACT.md ("Order lifecycle"). */
export const DELIVERY_FEE = 60;
export const FREE_DELIVERY_THRESHOLD = 1500;

function SpecRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Table.Tr>
      <Table.Th scope="row">{label}</Table.Th>
      <Table.Td>{children}</Table.Td>
    </Table.Tr>
  );
}

/** Description · Specifications · Batch & QC (batch-tracked only) · Delivery & Returns. */
export function ProductInfoTabs({ product }: { product: CatalogProductDetailDTO }) {
  const batches = product.batchSummary;

  return (
    <Tabs defaultValue="description" keepMounted={false}>
      <Tabs.List mb="lg">
        <Tabs.Tab value="description" fw={600}>
          Description
        </Tabs.Tab>
        <Tabs.Tab value="specifications" fw={600}>
          Specifications
        </Tabs.Tab>
        {product.requiresBatchTracking ? (
          <Tabs.Tab value="batches" fw={600} leftSection={<IconCalendarTime size={16} aria-hidden />}>
            Batch &amp; QC
          </Tabs.Tab>
        ) : null}
        <Tabs.Tab value="delivery" fw={600}>
          Delivery &amp; Returns
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="description">
        {product.description.trim() ? (
          <Text className={classes.description}>{product.description}</Text>
        ) : (
          <Text size="sm" c="dimmed">
            No description has been added for this product yet.
          </Text>
        )}
      </Tabs.Panel>

      <Tabs.Panel value="specifications">
        <Table className={classes.specTable} withRowBorders verticalSpacing="sm" maw={560}>
          <Table.Tbody>
            <SpecRow label="Brand">{product.brand ?? "—"}</SpecRow>
            <SpecRow label="Category">
              <Anchor component={Link} href={`/categories/${product.category.slug}`} size="sm">
                {product.category.name}
              </Anchor>
            </SpecRow>
            <SpecRow label="SKU">
              <Text component="span" size="sm" ff="monospace">
                {product.sku}
              </Text>
            </SpecRow>
            <SpecRow label="Batch tracking">
              {product.requiresBatchTracking ? "Yes — first-expiry, first-out dispatch" : "Not required"}
            </SpecRow>
            <SpecRow label="Availability">
              {product.isOutOfStock || product.totalStock <= 0 ? "Out of stock" : `${product.totalStock} in stock`}
            </SpecRow>
          </Table.Tbody>
        </Table>
      </Tabs.Panel>

      {product.requiresBatchTracking ? (
        <Tabs.Panel value="batches">
          <Stack gap="md">
            <Text size="sm" c="var(--mo-color-text-secondary)" lh={1.7}>
              This product is batch-tracked. Orders are filled from the batch that expires first (FEFO), and only
              unexpired batches are sold. These are the batches in stock right now:
            </Text>
            {batches.length > 0 ? (
              <Table.ScrollContainer minWidth={480}>
                <Table striped highlightOnHover withTableBorder verticalSpacing="sm" className="mo-tabular-nums">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Batch</Table.Th>
                      <Table.Th>Expiry date</Table.Th>
                      <Table.Th>Days left</Table.Th>
                      <Table.Th>Units</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {batches.map((batch, index) => (
                      <Table.Tr key={batch.batchNumber}>
                        <Table.Td fw={600}>
                          {batch.batchNumber}
                          {index === 0 ? (
                            <Badge size="xs" color="secondaryGreen" variant="light" ml={8}>
                              Ships next
                            </Badge>
                          ) : null}
                        </Table.Td>
                        <Table.Td>{formatDayMonthYear(batch.expiryDate) ?? batch.expiryDate}</Table.Td>
                        <Table.Td>{batch.daysUntilExpiry}</Table.Td>
                        <Table.Td>{batch.availableQuantity}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : (
              <Text size="sm" c="dimmed">
                No sellable batch is in stock right now.
              </Text>
            )}
          </Stack>
        </Tabs.Panel>
      ) : null}

      <Tabs.Panel value="delivery">
        <List spacing="md" size="sm" center={false}>
          <List.Item
            icon={
              <ThemeIcon size={26} radius="xl" variant="light" color="secondaryGreen">
                <IconTruckDelivery size={15} aria-hidden />
              </ThemeIcon>
            }
          >
            <Text size="sm" fw={600}>
              Delivery across Bangladesh
            </Text>
            <Text size="sm" c="var(--mo-color-text-secondary)">
              {formatBDT(DELIVERY_FEE)} delivery fee when your items total less than {formatBDT(FREE_DELIVERY_THRESHOLD)};
              free delivery at {formatBDT(FREE_DELIVERY_THRESHOLD)} or more (calculated before any coupon).
            </Text>
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon size={26} radius="xl" variant="light" color="secondaryGreen">
                <IconCash size={15} aria-hidden />
              </ThemeIcon>
            }
          >
            <Text size="sm" fw={600}>
              Cash on delivery
            </Text>
            <Text size="sm" c="var(--mo-color-text-secondary)">
              Pay when your parcel arrives.
            </Text>
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon size={26} radius="xl" variant="light" color="secondaryGreen">
                <IconX size={15} aria-hidden />
              </ThemeIcon>
            }
          >
            <Text size="sm" fw={600}>
              Cancellations
            </Text>
            <Text size="sm" c="var(--mo-color-text-secondary)">
              You can cancel an order yourself from{" "}
              <Anchor component={Link} href="/orders" size="sm">
                My Orders
              </Anchor>{" "}
              while it is still pending.
            </Text>
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon size={26} radius="xl" variant="light" color="secondaryGreen">
                <IconReceiptRefund size={15} aria-hidden />
              </ThemeIcon>
            }
          >
            <Text size="sm" fw={600}>
              Refunds
            </Text>
            <Text size="sm" c="var(--mo-color-text-secondary)">
              When a delivered order is refunded, its status changes to Refunded in My Orders.
            </Text>
          </List.Item>
        </List>
      </Tabs.Panel>
    </Tabs>
  );
}
