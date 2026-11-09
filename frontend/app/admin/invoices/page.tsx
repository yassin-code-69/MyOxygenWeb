"use client";

import { useState } from "react";
import {
  ActionIcon,
  Anchor,
  Box,
  Group,
  Menu,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCash,
  IconCreditCard,
  IconDotsVertical,
  IconEye,
  IconFileTypePdf,
  IconReceipt,
  IconReceipt2,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import { Price } from "../../../components/Price";
import { StatusBadge } from "../../../components/StatusBadge";
import { ConfirmModal } from "../../../components/admin/ConfirmModal";
import { DataTable, type DataTableColumn } from "../../../components/admin/DataTable";
import { DateRangeFilter, isCompleteRange, type DateRange } from "../../../components/admin/DateRangeFilter";
import { FilterBar } from "../../../components/admin/FilterBar";
import { KpiCard } from "../../../components/admin/KpiCard";
import { PageHeader } from "../../../components/admin/PageHeader";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import { formatCount, formatDhakaDateTime, formatMoney, paymentMethodLabel } from "../../../components/admin/format";
import { InvoiceDetailDrawer } from "../../../components/admin/invoices/InvoiceDetailDrawer";
import { useInvoiceMutations, useInvoices, useInvoiceSummary } from "../../../hooks/admin/use-invoices";
import { useCan } from "../../../hooks/admin/use-permission";
import { api, getErrorMessage } from "../../../lib/api-client";
import { PERMISSIONS } from "../../../types/auth";
import type { PaymentMethod, PaymentStatus } from "../../../types/order";
import { ADMIN_PAYMENT_METHODS, ADMIN_PAYMENT_STATUSES, type AdminInvoiceDTO } from "../../../types/admin";

const PAYMENT_STATUS_OPTIONS = [
  { value: "ALL", label: "Any payment status" },
  ...ADMIN_PAYMENT_STATUSES.map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() })),
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "ALL", label: "Any method" },
  ...ADMIN_PAYMENT_METHODS.map((value) => ({ value, label: paymentMethodLabel(value) })),
];

export default function AdminInvoicesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.ORDERS_READ}>
      <InvoicesView />
    </RequirePermission>
  );
}

function InvoicesView() {
  const canGenerate = useCan(PERMISSIONS.INVOICE_GENERATE);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "ALL">("ALL");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "ALL">("ALL");
  const [range, setRange] = useState<DateRange>([null, null]);
  const [appliedRange, setAppliedRange] = useState<DateRange>([null, null]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [openingPdf, setOpeningPdf] = useState<string | null>(null);
  const [regenerateTarget, setRegenerateTarget] = useState<AdminInvoiceDTO | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const list = useInvoices({
    page,
    limit,
    q: debouncedSearch,
    paymentStatus,
    paymentMethod,
    from: appliedRange[0],
    to: appliedRange[1],
  });
  const summary = useInvoiceSummary();
  const { regenerateInvoice } = useInvoiceMutations();

  const activeFilters =
    (search.trim() ? 1 : 0) + (paymentStatus !== "ALL" ? 1 : 0) + (paymentMethod !== "ALL" ? 1 : 0) + (appliedRange[0] ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    setPaymentStatus("ALL");
    setPaymentMethod("ALL");
    setRange([null, null]);
    setAppliedRange([null, null]);
    setPage(1);
  };

  const openPdf = async (invoice: AdminInvoiceDTO) => {
    setOpeningPdf(invoice.id);
    try {
      await api.open(`/admin/invoices/${invoice.id}/pdf`);
    } catch (error) {
      notifications.show({ color: "danger", title: `Invoice ${invoice.invoiceNumber}`, message: getErrorMessage(error) });
    } finally {
      setOpeningPdf(null);
    }
  };

  const confirmRegenerate = async () => {
    if (!regenerateTarget) {
      return;
    }
    setRegenerating(true);
    try {
      const invoice = await regenerateInvoice(regenerateTarget.orderId);
      notifications.show({ color: "success", title: "Invoice regenerated", message: `${invoice.invoiceNumber} has a fresh PDF.` });
      setRegenerateTarget(null);
    } catch (error) {
      notifications.show({ color: "danger", title: "Couldn't regenerate the invoice", message: getErrorMessage(error) });
    } finally {
      setRegenerating(false);
    }
  };

  const columns: DataTableColumn<AdminInvoiceDTO>[] = [
    {
      key: "invoice",
      header: "Invoice",
      width: 220,
      cell: (invoice) => (
        <Box>
          <Anchor component="button" type="button" size="sm" fw={700} ff="var(--mo-font-monospace)" onClick={() => setDetailId(invoice.id)}>
            {invoice.invoiceNumber}
          </Anchor>
          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            {formatDhakaDateTime(invoice.createdAt)}
          </Text>
        </Box>
      ),
    },
    {
      key: "order",
      header: "Order",
      width: 200,
      visibleFrom: "lg",
      cell: (invoice) => (
        <Text size="sm" ff="var(--mo-font-monospace)" c={invoice.orderNumber ? undefined : "dimmed"}>
          {invoice.orderNumber ?? "—"}
        </Text>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      skeletonWidth: "75%",
      cell: (invoice) => (
        <Box style={{ minWidth: 0 }}>
          <Text size="sm" fw={500} lineClamp={1}>
            {invoice.customerName}
          </Text>
          <Text size="xs" c="dimmed">
            {invoice.customerPhone}
          </Text>
        </Box>
      ),
    },
    {
      key: "items",
      header: "Items",
      align: "right",
      width: 70,
      visibleFrom: "md",
      cell: (invoice) => (
        <Text size="sm" className="mo-tabular-nums">
          {formatCount(invoice.itemCount)}
        </Text>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      width: 110,
      cell: (invoice) => <Price value={invoice.totalAmount} size="sm" />,
    },
    {
      key: "payment",
      header: "Payment",
      width: 160,
      cell: (invoice) => (
        <Stack gap={2} align="flex-start">
          <StatusBadge status={invoice.paymentStatus} size="xs" />
          <Text size="xs" c="dimmed">
            {paymentMethodLabel(invoice.paymentMethod)}
          </Text>
        </Stack>
      ),
    },
    {
      key: "actions",
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: "right",
      width: 100,
      skeletonWidth: 48,
      cell: (invoice) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip label={invoice.hasPdf || canGenerate ? "Open PDF" : "PDF not generated yet"}>
            <ActionIcon
              variant="subtle"
              color="primaryPink"
              onClick={() => void openPdf(invoice)}
              loading={openingPdf === invoice.id}
              disabled={!invoice.hasPdf && !canGenerate}
              aria-label={`Open PDF of ${invoice.invoiceNumber}`}
            >
              <IconFileTypePdf size={18} aria-hidden />
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${invoice.invoiceNumber}`}>
                <IconDotsVertical size={18} aria-hidden />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEye size={16} aria-hidden />} onClick={() => setDetailId(invoice.id)}>
                View details
              </Menu.Item>
              {canGenerate ? (
                <Menu.Item leftSection={<IconRefresh size={16} aria-hidden />} onClick={() => setRegenerateTarget(invoice)}>
                  Regenerate PDF
                </Menu.Item>
              ) : null}
            </Menu.Dropdown>
          </Menu>
        </Group>
      ),
    },
  ];

  const meta = list.data?.meta;
  const totals = summary.data;
  const summaryLoading = summary.isLoading && !totals;

  return (
    <Stack gap={0}>
      <PageHeader
        title="Invoices"
        description="One invoice per order, with the batch each item came from. PDFs open in a new tab. Times are in Dhaka."
      />

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md" mb="lg">
        <KpiCard label="Invoices" value={totals ? formatCount(totals.totalInvoices) : "—"} icon={<IconReceipt size={18} />} color="primaryPink" hint="All time" loading={summaryLoading} />
        <KpiCard label="Total billed" value={totals ? formatMoney(totals.totalBilledAmount) : "—"} icon={<IconReceipt2 size={18} />} color="accentPurple" hint="All time, incl. delivery" loading={summaryLoading} />
        <KpiCard label="Cash on delivery" value={totals ? formatCount(totals.codCount) : "—"} icon={<IconCash size={18} />} color="warning" hint="Invoices" loading={summaryLoading} />
        <KpiCard label="Online payment" value={totals ? formatCount(totals.onlineCount) : "—"} icon={<IconCreditCard size={18} />} color="info" hint="Invoices" loading={summaryLoading} />
      </SimpleGrid>

      <FilterBar activeCount={activeFilters} onReset={clearFilters}>
        <TextInput
          variant="search"
          label="Search"
          placeholder="Invoice or order number, name, phone"
          leftSection={<IconSearch size={16} aria-hidden />}
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          w={{ base: "100%", sm: 300 }}
        />
        <Select
          label="Payment status"
          data={PAYMENT_STATUS_OPTIONS}
          value={paymentStatus}
          allowDeselect={false}
          onChange={(value) => {
            setPaymentStatus(ADMIN_PAYMENT_STATUSES.find((item) => item === value) ?? "ALL");
            setPage(1);
          }}
          w={{ base: "100%", sm: 190 }}
          radius="xl"
        />
        <Select
          label="Method"
          data={PAYMENT_METHOD_OPTIONS}
          value={paymentMethod}
          allowDeselect={false}
          onChange={(value) => {
            setPaymentMethod(ADMIN_PAYMENT_METHODS.find((item) => item === value) ?? "ALL");
            setPage(1);
          }}
          w={{ base: "100%", sm: 180 }}
          radius="xl"
        />
        <DateRangeFilter
          label="Issued"
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

      <DataTable
        label="Invoices"
        columns={columns}
        rows={list.data?.items}
        getRowKey={(invoice) => invoice.id}
        loading={list.isLoading}
        refreshing={list.isLoading && Boolean(list.data)}
        error={list.error}
        onRetry={() => void list.mutate()}
        permission={PERMISSIONS.ORDERS_READ}
        minWidth={900}
        emptyIcon={<IconReceipt stroke={1.6} />}
        emptyTitle={activeFilters > 0 ? "No invoices match these filters" : "No invoices yet"}
        emptyDescription={activeFilters > 0 ? "Try different filters or clear them." : "An invoice is created for every order."}
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
                itemLabel: "invoices",
              }
            : undefined
        }
      />

      <InvoiceDetailDrawer
        invoiceId={detailId}
        onClose={() => setDetailId(null)}
        onOpenPdf={(invoice) => void openPdf(invoice)}
        onRegenerate={canGenerate ? setRegenerateTarget : undefined}
        openingPdf={openingPdf !== null && openingPdf === detailId}
        regenerating={regenerating}
      />

      <ConfirmModal
        opened={regenerateTarget !== null}
        onClose={() => setRegenerateTarget(null)}
        onConfirm={() => void confirmRegenerate()}
        loading={regenerating}
        title="Regenerate this invoice?"
        confirmLabel="Regenerate"
        message={`The PDF for ${regenerateTarget?.invoiceNumber ?? "this invoice"} is rebuilt from the current order. The invoice number stays the same.`}
      />
    </Stack>
  );
}
