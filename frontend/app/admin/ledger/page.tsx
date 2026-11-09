"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ActionIcon, Anchor, Badge, Box, Button, Group, Pill, Select, Stack, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconFileSpreadsheet, IconFilter } from "@tabler/icons-react";
import { DataTable, type DataTableColumn } from "../../../components/admin/DataTable";
import { DateRangeFilter, isCompleteRange, type DateRange } from "../../../components/admin/DateRangeFilter";
import { FilterBar } from "../../../components/admin/FilterBar";
import { PageHeader } from "../../../components/admin/PageHeader";
import { ProductPicker, type ProductOption } from "../../../components/admin/ProductPicker";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import {
  formatCalendarDate,
  formatCount,
  formatDhakaDateTime,
  formatSignedDelta,
  humanizeEnum,
  isoToDhakaWallTime,
  roleLabel,
  todayInDhaka,
} from "../../../components/admin/format";
import { useAdminProduct } from "../../../hooks/admin/use-admin-products";
import { fetchLedgerForExport, useLedger } from "../../../hooks/admin/use-ledger";
import { useCan } from "../../../hooks/admin/use-permission";
import { getErrorMessage } from "../../../lib/api-client";
import { downloadCsv, toCsv, type CsvColumn } from "../../../lib/csv";
import { PERMISSIONS } from "../../../types/auth";
import { ADMIN_LEDGER_REASONS, type AdminLedgerEntryDTO, type AdminLedgerReason } from "../../../types/admin";

const REASON_META: Record<AdminLedgerReason, { label: string; color: string }> = {
  IMPORT: { label: "Import", color: "secondaryGreen" },
  PURCHASE: { label: "Purchase", color: "info" },
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
  const searchParams = useSearchParams();
  const canOrders = useCan(PERMISSIONS.ORDERS_READ);

  const [reason, setReason] = useState<AdminLedgerReason | null>(null);
  const [productId, setProductId] = useState<string | null>(() => searchParams.get("productId"));
  const [order, setOrder] = useState<{ id: string; number: string | null } | null>(() => {
    const id = searchParams.get("orderId");
    return id ? { id, number: null } : null;
  });
  const [range, setRange] = useState<DateRange>([null, null]);
  const [appliedRange, setAppliedRange] = useState<DateRange>([null, null]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const exportAbort = useRef<AbortController | null>(null);

  useEffect(() => () => exportAbort.current?.abort(), []);

  const { data: linkedProduct } = useAdminProduct(searchParams.get("productId"));
  const productInitial: ProductOption | null = linkedProduct
    ? { id: linkedProduct.id, title: linkedProduct.title, sku: linkedProduct.sku, listingStatus: linkedProduct.listingStatus }
    : null;

  const filters = {
    reason,
    productId,
    orderId: order?.id ?? null,
    from: appliedRange[0],
    to: appliedRange[1],
  };
  const list = useLedger({ page, limit, ...filters });
  const rows = list.data?.items;
  const orderLabel = order?.number ?? rows?.find((row) => row.orderId === order?.id)?.orderNumber ?? "selected order";

  const activeFilters = (reason ? 1 : 0) + (productId ? 1 : 0) + (order ? 1 : 0) + (appliedRange[0] ? 1 : 0);
  const clearFilters = () => {
    setReason(null);
    setProductId(null);
    setOrder(null);
    setRange([null, null]);
    setAppliedRange([null, null]);
    setPage(1);
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
      width: 170,
      cell: (row) => (
        <Text size="sm" style={{ whiteSpace: "nowrap" }}>
          {formatDhakaDateTime(row.createdAt)}
        </Text>
      ),
    },
    {
      key: "product",
      header: "Product",
      skeletonWidth: "80%",
      cell: (row) => (
        <Box style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} lineClamp={1}>
            {row.productTitle}
          </Text>
          <Text size="xs" c="dimmed" ff="var(--mo-font-monospace)">
            {row.sku}
          </Text>
        </Box>
      ),
    },
    {
      key: "batch",
      header: "Batch",
      width: 170,
      visibleFrom: "md",
      cell: (row) =>
        row.batchNumber ? (
          <Box>
            <Text size="sm" ff="var(--mo-font-monospace)">
              {row.batchNumber}
            </Text>
            {row.expiryDate ? (
              <Text size="xs" c="dimmed">
                Exp. {formatCalendarDate(row.expiryDate)}
              </Text>
            ) : null}
          </Box>
        ) : (
          <Text size="sm" c="dimmed">
            —
          </Text>
        ),
    },
    {
      key: "delta",
      header: "Change",
      align: "right",
      width: 90,
      cell: (row) => (
        <Text
          size="sm"
          fw={700}
          className="mo-tabular-nums"
          c={row.changeDelta > 0 ? "var(--mo-color-text-success)" : "var(--mo-color-text-danger)"}
          aria-label={`${row.changeDelta > 0 ? "Added" : "Removed"} ${formatCount(Math.abs(row.changeDelta))}`}
        >
          {formatSignedDelta(row.changeDelta)}
        </Text>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      width: 90,
      cell: (row) => (
        <Text size="sm" className="mo-tabular-nums">
          {formatCount(row.balanceAfter)}
        </Text>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      width: 160,
      cell: (row) => {
        const meta = reasonMeta(row.reason);
        return (
          <Badge variant="light" color={meta.color} tt="none" fw={600}>
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: "order",
      header: "Order",
      width: 210,
      visibleFrom: "lg",
      cell: (row) =>
        row.orderId && row.orderNumber ? (
          <Group gap={4} wrap="nowrap">
            {canOrders ? (
              <Anchor component={Link} href={`/admin/orders?q=${encodeURIComponent(row.orderNumber)}`} size="sm" ff="var(--mo-font-monospace)">
                {row.orderNumber}
              </Anchor>
            ) : (
              <Text size="sm" ff="var(--mo-font-monospace)">
                {row.orderNumber}
              </Text>
            )}
            <Tooltip label="Only show this order">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label={`Filter the ledger by order ${row.orderNumber}`}
                onClick={() => {
                  setOrder({ id: row.orderId ?? "", number: row.orderNumber });
                  setPage(1);
                }}
              >
                <IconFilter size={14} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            —
          </Text>
        ),
    },
    {
      key: "by",
      header: "Performed by",
      width: 170,
      visibleFrom: "md",
      cell: (row) =>
        row.performedBy ? (
          <Box>
            <Text size="sm" lineClamp={1}>
              {row.performedBy.fullName}
            </Text>
            <Text size="xs" c="dimmed">
              {roleLabel(row.performedBy.role)}
            </Text>
          </Box>
        ) : (
          <Text size="sm" c="dimmed">
            System
          </Text>
        ),
    },
    {
      key: "note",
      header: "Note",
      visibleFrom: "xl",
      cell: (row) =>
        row.note ? (
          <Tooltip label={row.note} multiline w={320} disabled={row.note.length < 48}>
            <Text size="sm" c="dimmed" lineClamp={2}>
              {row.note}
            </Text>
          </Tooltip>
        ) : (
          <Text size="sm" c="dimmed">
            —
          </Text>
        ),
    },
  ];

  const meta = list.data?.meta;

  return (
    <Stack gap={0}>
      <PageHeader
        title="Stock Ledger"
        description="Every stock movement — imports, sales, returns, adjustments and write-offs — newest first. Entries can't be edited. Times are in Dhaka."
      />

      <FilterBar
        activeCount={activeFilters}
        onReset={clearFilters}
        actions={
          <Button
            variant="default"
            leftSection={<IconDownload size={16} aria-hidden />}
            onClick={() => void handleExport()}
            loading={exporting !== null}
            disabled={!meta || meta.total === 0}
          >
            Export CSV
          </Button>
        }
      >
        <Select
          label="Reason"
          placeholder="All reasons"
          clearable
          data={ADMIN_LEDGER_REASONS.map((value) => ({ value, label: REASON_META[value].label }))}
          value={reason}
          onChange={(value) => {
            setReason(ADMIN_LEDGER_REASONS.find((item) => item === value) ?? null);
            setPage(1);
          }}
          w={{ base: "100%", sm: 200 }}
          radius="xl"
        />
        <ProductPicker
          label="Product"
          placeholder="All products"
          clearable
          value={productId}
          initialProduct={productInitial}
          onChange={(id) => {
            setProductId(id);
            setPage(1);
          }}
          w={{ base: "100%", sm: 280 }}
          radius="xl"
        />
        <DateRangeFilter
          value={range}
          onChange={(next) => {
            setRange(next);
            if (isCompleteRange(next)) {
              setAppliedRange(next);
              setPage(1);
            }
          }}
        />
      </FilterBar>

      {order || exporting ? (
        <Group gap="sm" mb="md" wrap="wrap">
          {order ? (
            <Pill
              withRemoveButton
              onRemove={() => {
                setOrder(null);
                setPage(1);
              }}
              removeButtonProps={{ "aria-label": "Remove the order filter" }}
              size="md"
            >
              Order {orderLabel}
            </Pill>
          ) : null}
          {exporting ? (
            <Text size="sm" c="dimmed" className="mo-tabular-nums" aria-live="polite">
              Preparing export… {formatCount(exporting.done)} of {formatCount(Math.min(exporting.total, EXPORT_LIMIT))} rows
            </Text>
          ) : null}
        </Group>
      ) : null}

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
        minWidth={980}
        skeletonRows={10}
        emptyIcon={<IconFileSpreadsheet stroke={1.6} />}
        emptyTitle={activeFilters > 0 ? "No entries match these filters" : "No stock movements yet"}
        emptyDescription={activeFilters > 0 ? "Try a wider date range or clear the filters." : "Importing a batch creates the first entry."}
        pagination={
          meta
            ? {
                page: meta.page,
                totalPages: meta.totalPages,
                total: meta.total,
                limit: meta.limit,
                onPageChange: setPage,
                onLimitChange: (value) => {
                  setLimit(value);
                  setPage(1);
                },
                itemLabel: "entries",
              }
            : undefined
        }
      />
    </Stack>
  );
}
