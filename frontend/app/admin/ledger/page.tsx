"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ActionIcon, Anchor, Avatar, Badge, Box, Button, Group, Pill, Select, Stack, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconFileSpreadsheet, IconFilter, IconHistory, IconRobot } from "@tabler/icons-react";
import { BatchProductCell } from "../../../components/admin/batches/batch-ui";
import { DataTable, type DataTableColumn } from "../../../components/admin/DataTable";
import { ProductPicker, type ProductOption } from "../../../components/admin/ProductPicker";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import {
  formatCalendarDate,
  formatCount,
  formatDhakaDate,
  formatDhakaDateTime,
  formatDhakaTime,
  formatSignedDelta,
  humanizeEnum,
  initialsOf,
  isoToDhakaWallTime,
  pluralize,
  roleLabel,
  todayInDhaka,
} from "../../../components/admin/format";
import { PageHeader, type DateRangeValue } from "../../../components/admin/kit";
import { HiddenLabelField, ListCard } from "../../../components/admin/products/ListCard";
import { OptionalDateRange } from "../../../components/admin/products/OptionalDateRange";
import { useAdminProduct, useProductIndex } from "../../../hooks/admin/use-admin-products";
import { fetchLedgerForExport, useLedger } from "../../../hooks/admin/use-ledger";
import { pickParam, usePaging, useUrlParams } from "../../../hooks/admin/use-ops-url-state";
import { useCan } from "../../../hooks/admin/use-permission";
import { getErrorMessage } from "../../../lib/api-client";
import { downloadCsv, toCsv, type CsvColumn } from "../../../lib/csv";
import { PERMISSIONS } from "../../../types/auth";
import { ADMIN_LEDGER_REASONS, type AdminLedgerEntryDTO, type AdminLedgerReason } from "../../../types/admin";

const REASON_META: Record<AdminLedgerReason, { label: string; color: string }> = {
  IMPORT: { label: "Import", color: "secondaryGreen" },
  PURCHASE: { label: "Customer purchase", color: "info" },
  RETURN: { label: "Return", color: "accentPurple" },
  MANUAL_ADJUSTMENT: { label: "Manual adjustment", color: "warning" },
  ADJUSTMENT: { label: "Manual adjustment", color: "warning" },
  EXPIRED_SCRAP: { label: "Expired scrap", color: "danger" },
};

const EXPORT_LIMIT = 5000;

function reasonMeta(reason: string): { label: string; color: string } {
  return (REASON_META as Record<string, { label: string; color: string } | undefined>)[reason] ?? { label: humanizeEnum(reason), color: "gray" };
}

const CSV_COLUMNS: CsvColumn<AdminLedgerEntryDTO>[] = [
  { header: "Date (Asia/Dhaka)", value: (row) => isoToDhakaWallTime(row.createdAt) },
  { header: "Product", value: (row) => row.productTitle },
  { header: "SKU", value: (row) => row.sku },
  { header: "Batch", value: (row) => row.batchNumber },
  { header: "Batch expiry", value: (row) => row.expiryDate },
  { header: "Change", value: (row) => row.changeDelta },
  { header: "Balance after", value: (row) => row.balanceAfter },
  { header: "Reason", value: (row) => reasonMeta(row.reason).label },
  { header: "Order", value: (row) => row.orderNumber },
  { header: "Performed by", value: (row) => row.performedBy?.fullName ?? "System" },
  { header: "Role", value: (row) => (row.performedBy ? roleLabel(row.performedBy.role) : "") },
  { header: "Note", value: (row) => row.note },
];

export default function AdminLedgerPage() {
  return (
    <RequirePermission permission={PERMISSIONS.STOCK_ADJUST}>
      <LedgerView />
    </RequirePermission>
  );
}

function LedgerView() {
  const { searchParams, setParams } = useUrlParams();
  const canOrders = useCan(PERMISSIONS.ORDERS_READ);

  // Deep links: ?productId=, ?orderId=, ?reason=.
  const productId = searchParams.get("productId");
  const orderId = searchParams.get("orderId");
  const reasonParam = searchParams.get("reason");
  const reason: AdminLedgerReason | null = reasonParam ? pickParam<AdminLedgerReason>(reasonParam, ADMIN_LEDGER_REASONS, "IMPORT") : null;
  const [orderLabel, setOrderLabel] = useState<string | null>(null);
  const [range, setRange] = useState<DateRangeValue | null>(null);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const exportAbort = useRef<AbortController | null>(null);

  useEffect(() => () => exportAbort.current?.abort(), []);

  const { data: linkedProduct } = useAdminProduct(productId);
  const { data: productIndex } = useProductIndex();
  const productInitial: ProductOption | null = linkedProduct
    ? { id: linkedProduct.id, title: linkedProduct.title, sku: linkedProduct.sku, listingStatus: linkedProduct.listingStatus }
    : null;

  const filters = { reason, productId, orderId, from: range?.from ?? null, to: range?.to ?? null };
  const paging = usePaging(JSON.stringify(filters), 50);
  const list = useLedger({ page: paging.page, limit: paging.limit, ...filters });
  const rows = list.data?.items;
  const orderNumber = orderLabel ?? rows?.find((row) => row.orderId === orderId)?.orderNumber ?? "selected order";

  const activeFilters = (reason ? 1 : 0) + (productId ? 1 : 0) + (orderId ? 1 : 0) + (range ? 1 : 0);
  const clearFilters = () => {
    setRange(null);
    setParams({ reason: null, productId: null, orderId: null });
  };

  const handleExport = async () => {
    exportAbort.current?.abort();
    const controller = new AbortController();
    exportAbort.current = controller;
    setExporting({ done: 0, total: list.data?.meta.total ?? 0 });
    try {
      const result = await fetchLedgerForExport(filters, {
        maxRows: EXPORT_LIMIT,
        signal: controller.signal,
        onProgress: (done, total) => setExporting({ done, total }),
      });
      if (result.items.length === 0) {
        notifications.show({ color: "info", title: "Nothing to export", message: "No ledger entries match these filters." });
        return;
      }
      downloadCsv(`stock-ledger-${todayInDhaka()}.csv`, toCsv(result.items, CSV_COLUMNS));
      notifications.show({
        color: result.truncated ? "warning" : "success",
        title: result.truncated ? "Export capped" : "Export ready",
        message: result.truncated
          ? `Exported the newest ${formatCount(result.items.length)} of ${formatCount(result.total)} entries. Narrow the filters to export the rest.`
          : `${formatCount(result.items.length)} entries exported.`,
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        notifications.show({ color: "danger", title: "Export failed", message: getErrorMessage(error) });
      }
    } finally {
      setExporting(null);
    }
  };

  const columns: DataTableColumn<AdminLedgerEntryDTO>[] = [
    {
      key: "date",
      header: "Date",
      width: 120,
      cell: (row) => (
        <Text
          component="time"
          dateTime={row.createdAt}
          title={formatDhakaDateTime(row.createdAt)}
          size="xs"
          lh={1.5}
          c="var(--mo-color-text-secondary)"
          display="block"
          style={{ whiteSpace: "nowrap" }}
        >
          {formatDhakaDate(row.createdAt)}
          <br />
          {formatDhakaTime(row.createdAt)}
        </Text>
      ),
    },
    {
      key: "product",
      header: "Product",
      width: 230,
      skeletonWidth: "80%",
      cell: (row) => <BatchProductCell productId={row.productId} title={row.productTitle} sku={row.sku} index={productIndex} />,
    },
    {
      key: "batch",
      header: "Batch",
      width: 150,
      cell: (row) =>
        row.batchNumber ? (
          <Box>
            <Text size="sm" ff="var(--mo-font-monospace)" style={{ whiteSpace: "nowrap" }}>
              {row.batchNumber}
            </Text>
            {row.expiryDate ? (
              <Text size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap" }}>
                Exp. {formatCalendarDate(row.expiryDate)}
              </Text>
            ) : null}
          </Box>
        ) : (
          <Text size="sm" c="var(--mo-color-text-muted)">
            —
          </Text>
        ),
    },
    {
      key: "delta",
      header: "Change",
      align: "right",
      width: 110,
      cell: (row) => (
        <Stack gap={4} align="flex-end">
          <Badge
            variant="light"
            radius="xl"
            color={row.changeDelta > 0 ? "success" : "danger"}
            fw={700}
            className="mo-tabular-nums"
            style={{ maxWidth: "none" }}
            aria-label={`${row.changeDelta > 0 ? "Added" : "Removed"} ${formatCount(Math.abs(row.changeDelta))}`}
          >
            {formatSignedDelta(row.changeDelta)}
          </Badge>
          <Text size="xs" c="var(--mo-color-text-muted)" className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
            Balance {formatCount(row.balanceAfter)}
          </Text>
        </Stack>
      ),
    },
    {
      key: "reason",
      header: "Reason & note",
      width: 200,
      cell: (row) => {
        const meta = reasonMeta(row.reason);
        return (
          <Stack gap={4} align="flex-start" miw={160}>
            <Badge variant="light" radius="xl" color={meta.color} tt="none" fw={600}>
              {meta.label}
            </Badge>
            {row.note ? (
              <Tooltip label={row.note} multiline w={320} disabled={row.note.length < 40}>
                <Text size="xs" c="var(--mo-color-text-secondary)" lineClamp={2} maw={200}>
                  {row.note}
                </Text>
              </Tooltip>
            ) : null}
          </Stack>
        );
      },
    },
    {
      key: "order",
      header: "Order",
      width: 170,
      cell: (row) =>
        row.orderId && row.orderNumber ? (
          <Group gap={4} wrap="nowrap">
            {canOrders ? (
              <Anchor component={Link} href={`/admin/orders?orderId=${encodeURIComponent(row.orderId)}`} size="xs" fw={600} ff="var(--mo-font-monospace)">
                {row.orderNumber}
              </Anchor>
            ) : (
              <Text size="xs" ff="var(--mo-font-monospace)">
                {row.orderNumber}
              </Text>
            )}
            <Tooltip label="Only show this order">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                radius="xl"
                aria-label={`Filter the ledger by order ${row.orderNumber}`}
                onClick={() => {
                  setOrderLabel(row.orderNumber);
                  setParams({ orderId: row.orderId });
                }}
              >
                <IconFilter size={14} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Group>
        ) : (
          <Text size="sm" c="var(--mo-color-text-muted)">
            —
          </Text>
        ),
    },
    {
      key: "by",
      header: "Performed by",
      width: 170,
      cell: (row) => (
        <Group gap="xs" wrap="nowrap" miw={140}>
          <Avatar radius="xl" size={28} color={row.performedBy ? "accentPurple" : "gray"} aria-hidden>
            {row.performedBy ? initialsOf(row.performedBy.fullName) : <IconRobot size={14} />}
          </Avatar>
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" lineClamp={1}>
              {row.performedBy?.fullName ?? "System"}
            </Text>
            <Text size="xs" c="var(--mo-color-text-muted)">
              {row.performedBy ? roleLabel(row.performedBy.role) : "Checkout / jobs"}
            </Text>
          </Box>
        </Group>
      ),
    },
  ];

  const meta = list.data?.meta;

  return (
    <Stack gap="lg">
      <PageHeader
        mb={0}
        icon={<IconHistory size={20} />}
        title="Stock Ledger"
        subtitle="Every stock movement (imports, sales, returns, adjustments and write-offs), newest first. Entries can't be edited. Times are in Dhaka."
      />

      <ListCard
        title="Stock movements"
        icon={<IconFileSpreadsheet size={18} color="var(--mo-color-secondary-8)" aria-hidden />}
        subtitle={meta ? pluralize(meta.total, activeFilters > 0 ? "matching entry" : "entry", activeFilters > 0 ? "matching entries" : "entries") : "Loading the ledger…"}
        actions={
          <Button
            variant="default"
            radius="xl"
            size="sm"
            leftSection={<IconDownload size={16} aria-hidden />}
            onClick={() => void handleExport()}
            loading={exporting !== null}
            disabled={!meta || meta.total === 0}
          >
            Export CSV
          </Button>
        }
        filters={
          <>
            <Select
              aria-label="Reason"
              placeholder="All reasons"
              clearable
              data={ADMIN_LEDGER_REASONS.map((value) => ({ value, label: REASON_META[value].label }))}
              value={reason}
              onChange={(value) => setParams({ reason: value })}
              w={{ base: "100%", xs: 200 }}
              radius="xl"
            />
            <HiddenLabelField w={{ base: "100%", sm: 280 }}>
              <ProductPicker
                label="Product"
                placeholder="All products"
                clearable
                value={productId}
                initialProduct={productInitial}
                onChange={(id) => setParams({ productId: id })}
                w="100%"
                radius="xl"
              />
            </HiddenLabelField>
            <OptionalDateRange label="Date" value={range} onChange={setRange} />
            {orderId ? (
              <Pill
                withRemoveButton
                onRemove={() => {
                  setOrderLabel(null);
                  setParams({ orderId: null });
                }}
                removeButtonProps={{ "aria-label": "Remove the order filter" }}
                size="lg"
                mb={6}
              >
                Order {orderNumber}
              </Pill>
            ) : null}
            {exporting ? (
              <Text size="sm" c="var(--mo-color-text-secondary)" className="mo-tabular-nums" aria-live="polite" mb={8}>
                Preparing export… {formatCount(exporting.done)} of {formatCount(Math.min(exporting.total, EXPORT_LIMIT))} rows
              </Text>
            ) : null}
          </>
        }
        activeFilterCount={activeFilters}
        onResetFilters={clearFilters}
      >
        <DataTable
          label="Stock ledger"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          loading={list.isLoading}
          refreshing={list.isLoading && Boolean(list.data)}
          error={list.error}
          onRetry={() => void list.mutate()}
          permission={PERMISSIONS.STOCK_ADJUST}
          minWidth={1130}
          skeletonRows={10}
          emptyIcon={<IconFileSpreadsheet stroke={1.6} />}
          emptyTitle={activeFilters > 0 ? "No entries match these filters" : "No stock movements yet"}
          emptyDescription={activeFilters > 0 ? "Try a wider date range or clear the filters." : "Importing a batch creates the first entry."}
          emptyAction={
            activeFilters > 0 ? (
              <Button variant="light" radius="xl" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null
          }
          pagination={
            meta
              ? {
                  page: meta.page,
                  totalPages: meta.totalPages,
                  total: meta.total,
                  limit: meta.limit,
                  onPageChange: paging.setPage,
                  onLimitChange: paging.setLimit,
                  itemLabel: "entries",
                }
              : undefined
          }
        />
      </ListCard>
    </Stack>
  );
}
