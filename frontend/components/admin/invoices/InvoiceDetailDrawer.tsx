"use client";

import Link from "next/link";
import { Anchor, Box, Button, Divider, Drawer, Group, Paper, SimpleGrid, Skeleton, Stack, Table, Text, Title } from "@mantine/core";
import { IconFileTypePdf, IconRefresh } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { StatusBadge } from "../../StatusBadge";
import { useInvoiceDetail } from "../../../hooks/admin/use-invoices";
import { PERMISSIONS } from "../../../types/auth";
import type { AdminInvoiceDTO } from "../../../types/admin";
import { formatCalendarDate, formatCount, formatDhakaDateTime, formatMoney, paymentMethodLabel } from "../format";
import { QueryError } from "../QueryError";
import { courierName } from "../orders/order-utils";

export interface InvoiceDetailDrawerProps {
  invoiceId: string | null;
  onClose: () => void;
  onOpenPdf: (invoice: AdminInvoiceDTO) => void;
  /** Present only for users with INVOICE_GENERATE. */
  onRegenerate?: (invoice: AdminInvoiceDTO) => void;
  openingPdf?: boolean;
  regenerating?: boolean;
}

function Row({ label, value, strong = false }: { label: ReactNode; value: string; strong?: boolean }) {
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

/** Invoice snapshot (`GET /admin/invoices/:id`): billed customer, lines per batch, totals, linked order. */
export function InvoiceDetailDrawer({
  invoiceId,
  onClose,
  onOpenPdf,
  onRegenerate,
  openingPdf = false,
  regenerating = false,
}: InvoiceDetailDrawerProps) {
  const { data: invoice, error, isLoading, mutate } = useInvoiceDetail(invoiceId);

  return (
    <Drawer opened={invoiceId !== null} onClose={onClose} position="right" size="xl" title={<Text fw={700}>Invoice</Text>}>
      {isLoading && !invoice ? (
        <Stack gap="md">
          <Skeleton height={28} width="50%" />
          <Skeleton height={100} radius="md" />
          <Skeleton height={220} radius="md" />
        </Stack>
      ) : null}
      {error && !invoice ? <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.ORDERS_READ} /> : null}

      {invoice ? (
        <Stack gap="lg">
          <Box>
            <Group gap="xs" mb={6}>
              <StatusBadge status={invoice.paymentStatus} />
              {invoice.order ? <StatusBadge status={invoice.order.status} variant="outline" /> : null}
            </Group>
            <Title order={2} fz={22} ff="var(--mo-font-monospace)">
              {invoice.invoiceNumber}
            </Title>
            <Text size="sm" c="dimmed">
              Issued {formatDhakaDateTime(invoice.createdAt)} · {paymentMethodLabel(invoice.paymentMethod)}
            </Text>
          </Box>

          <Group gap="xs">
            <Button size="xs" leftSection={<IconFileTypePdf size={14} aria-hidden />} loading={openingPdf} onClick={() => onOpenPdf(invoice)}>
              Open PDF
            </Button>
            {onRegenerate ? (
              <Button
                size="xs"
                variant="default"
                leftSection={<IconRefresh size={14} aria-hidden />}
                loading={regenerating}
                onClick={() => onRegenerate(invoice)}
              >
                Regenerate
              </Button>
            ) : null}
          </Group>
          {!invoice.hasPdf ? (
            <Text size="xs" c="dimmed">
              The PDF hasn&apos;t been generated yet.{" "}
              {onRegenerate ? "Opening it generates it now." : "Someone with invoice permission needs to generate it first."}
            </Text>
          ) : null}

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Paper withBorder radius="md" p="md">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={6}>
                Billed to
              </Text>
              <Text size="sm" fw={600}>
                {invoice.customerName}
              </Text>
              <Text size="sm">{invoice.customerPhone}</Text>
              <Text size="sm" c="var(--mo-color-text-secondary)">
                {invoice.customerAddress}
              </Text>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={6}>
                Order
              </Text>
              {invoice.order ? (
                <>
                  <Anchor
                    component={Link}
                    href={`/admin/orders?q=${encodeURIComponent(invoice.order.orderNumber)}`}
                    size="sm"
                    fw={600}
                    ff="var(--mo-font-monospace)"
                  >
                    {invoice.order.orderNumber}
                  </Anchor>
                  <Text size="xs" c="dimmed">
                    Placed {formatDhakaDateTime(invoice.order.createdAt)}
                  </Text>
                  {invoice.order.trackingId ? (
                    <Text size="xs" c="dimmed">
                      {courierName(invoice.order.courierProvider)} · {invoice.order.trackingId}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  {invoice.orderNumber ?? "The order is no longer available."}
                </Text>
              )}
            </Paper>
          </SimpleGrid>

          <Box>
            <Text fw={600} mb="xs">
              Items ({formatCount(invoice.itemCount)})
            </Text>
            <Table.ScrollContainer minWidth={560} type="native">
              <Table verticalSpacing="xs" aria-label={`Items on ${invoice.invoiceNumber}`}>
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
                  {invoice.items.map((item) => (
                    <Table.Tr key={item.orderItemId}>
                      <Table.Td>
                        <Text size="sm" fw={500} lineClamp={2}>
                          {item.title}
                        </Text>
                        {item.sku ? (
                          <Text size="xs" c="dimmed" ff="var(--mo-font-monospace)">
                            {item.sku}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" ff="var(--mo-font-monospace)">
                          {item.batchNumber ?? "—"}
                        </Text>
                        {item.expiryDate ? (
                          <Text size="xs" c="dimmed">
                            Exp. {formatCalendarDate(item.expiryDate)}
                          </Text>
                        ) : null}
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
            <Stack gap={4} mt="sm" ml="auto" maw={320}>
              <Row label="Subtotal" value={formatMoney(invoice.subtotal)} />
              {invoice.discountAmount > 0 ? <Row label="Discount" value={`−${formatMoney(invoice.discountAmount)}`} /> : null}
              <Row label="Delivery" value={invoice.deliveryFee > 0 ? formatMoney(invoice.deliveryFee) : "Free"} />
              <Divider my={4} />
              <Row label="Total" value={formatMoney(invoice.totalAmount)} strong />
            </Stack>
          </Box>
        </Stack>
      ) : null}
    </Drawer>
  );
}
