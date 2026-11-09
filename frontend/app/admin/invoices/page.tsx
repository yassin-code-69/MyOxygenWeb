"use client";

import { useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Menu,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCash,
  IconCreditCard,
  IconDotsVertical,
  IconEye,
  IconFileInvoice,
  IconFileTypePdf,
  IconReceipt,
  IconReceipt2,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import { StatusBadge } from "../../../components/StatusBadge";
import { ConfirmModal } from "../../../components/admin/ConfirmModal";
import { DataTable, type DataTableColumn } from "../../../components/admin/DataTable";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import {
  formatCount,
  formatDhakaDate,
  formatDhakaDateTime,
  formatDhakaTime,
  formatMoney,
  paymentMethodLabel,
  pluralize,
} from "../../../components/admin/format";
import { InvoiceDetailDrawer } from "../../../components/admin/invoices/InvoiceDetailDrawer";
import { KpiCard, PageHeader, type DateRangeValue } from "../../../components/admin/kit";
import { ListCard } from "../../../components/admin/products/ListCard";
import { OptionalDateRange } from "../../../components/admin/products/OptionalDateRange";
import { useInvoiceMutations, useInvoices, useInvoiceSummary } from "../../../hooks/admin/use-invoices";
import { usePaging, useUrlParams } from "../../../hooks/admin/use-ops-url-state";
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
  { value: "ALL", label: "Any payment method" },
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
  const { searchParams, setParams } = useUrlParams();
  const canGenerate = useCan(PERMISSIONS.INVOICE_GENERATE);

  // Deep links: ?invoiceId= (drawer), ?q= (search seed).
  const detailId = searchParams.get("invoiceId");
  const urlQuery = searchParams.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState({ source: urlQuery, text: urlQuery });
  const search = searchDraft.source === urlQuery ? searchDraft.text : urlQuery;
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "ALL">("ALL");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "ALL">("ALL");
  const [range, setRange] = useState<DateRangeValue | null>(null);
  const [openingPdf, setOpeningPdf] = useState<string | null>(null);
  const [regenerateTarget, setRegenerateTarget] = useState<AdminInvoiceDTO | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const filters = { q: debouncedSearch, paymentStatus, paymentMethod, from: range?.from ?? null, to: range?.to ?? null };
  const paging = usePaging(JSON.stringify(filters));
  const list = useInvoices({ page: paging.page, limit: paging.limit, ...filters });
  const summary = useInvoiceSummary();
  const { regenerateInvoice } = useInvoiceMutations();

  const activeFilters = (search.trim() ? 1 : 0) + (paymentStatus !== "ALL" ? 1 : 0) + (paymentMethod !== "ALL" ? 1 : 0) + (range ? 1 : 0);
  const clearFilters = () => {
    setSearchDraft({ source: urlQuery, text: "" });
    setPaymentStatus("ALL");
    setPaymentMethod("ALL");
    setRange(null);
    if (urlQuery) {
      setParams({ q: null });
    }
  };

  const openDetail = (invoice: AdminInvoiceDTO) => setParams({ invoiceId: invoice.id });

  const openPdf = async (invoice: Pick<AdminInvoiceDTO, "id" | "invoiceNumber">) => {
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
      width: 230,
      cell: (invoice) => (
        <Group gap="sm" wrap="nowrap" miw={190}>
          <ThemeIcon size={36} radius="xl" variant="light" color="secondaryGreen" aria-hidden>
            <IconFileInvoice size={18} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <UnstyledButton onClick={() => openDetail(invoice)} aria-label={`Open invoice ${invoice.invoiceNumber}`}>
              <Text size="sm" fw={700} ff="var(--mo-font-monospace)" c="var(--mo-color-text)" style={{ whiteSpace: "nowrap" }}>
                {invoice.invoiceNumber}
              </Text>
            </UnstyledButton>
            <Text size="xs" c="var(--mo-color-text-muted)" ff="var(--mo-font-monospace)" style={{ whiteSpace: "nowrap" }}>
              {invoice.orderNumber ?? "Order unavailable"}
            </Text>
          </Box>
        </Group>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      width: 200,
      skeletonWidth: "75%",
      cell: (invoice) => (
        <Box style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} lineClamp={1} c="var(--mo-color-text)">
            {invoice.customerName}
          </Text>
          <Text size="xs" c="var(--mo-color-text-muted)">
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
      width: 120,
      cell: (invoice) => (
        <Text size="sm" fw={700} className="mo-tabular-nums" c="var(--mo-color-text)" style={{ whiteSpace: "nowrap" }}>
          {formatMoney(invoice.totalAmount)}
        </Text>
      ),
    },
    {
      key: "payment",
      header: "Payment",
      width: 150,
      cell: (invoice) => (
        <Stack gap={4} align="flex-start">
          <StatusBadge status={invoice.paymentStatus} size="sm" />
          <Text size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap" }}>
            {paymentMethodLabel(invoice.paymentMethod)}
          </Text>
        </Stack>
      ),
    },
    {
      key: "issued",
      header: "Issued",
      width: 120,
      cell: (invoice) => (
        <Text
          component="time"
          dateTime={invoice.createdAt}
          title={formatDhakaDateTime(invoice.createdAt)}
          size="xs"
          lh={1.5}
          c="var(--mo-color-text-secondary)"
          display="block"
          style={{ whiteSpace: "nowrap" }}
        >
          {formatDhakaDate(invoice.createdAt)}
          <br />
          {formatDhakaTime(invoice.createdAt)}
        </Text>
      ),
    },
    {
      key: "actions",
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: "right",
      width: 150,
      skeletonWidth: 90,
      cell: (invoice) => (
        <Group gap={6} justify="flex-end" wrap="nowrap">
          <Button size="compact-sm" radius="xl" variant="light" color="info" onClick={() => openDetail(invoice)} aria-label={`View invoice ${invoice.invoiceNumber}`}>
            View
          </Button>
          <Tooltip label={invoice.hasPdf || canGenerate ? "Open PDF" : "PDF not generated yet"}>
            <ActionIcon
              variant="subtle"
              color="primaryPink"
              radius="xl"
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
              <ActionIcon variant="subtle" color="gray" radius="xl" aria-label={`More actions for ${invoice.invoiceNumber}`}>
                <IconDotsVertical size={18} aria-hidden />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEye size={16} aria-hidden />} onClick={() => openDetail(invoice)}>
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
    <Stack gap="lg">
      <PageHeader
        mb={0}
        icon={<IconFileInvoice size={20} />}
        title="Invoices"
        subtitle="One invoice per order, listing the batch each item came from. PDFs open in a new tab. Times are in Dhaka."
      />

      {summary.error && !totals ? null : (
        <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
          <KpiCard
            tone="mint"
            icon={<IconReceipt size={24} stroke={1.8} />}
            label="Invoices"
            value={totals ? formatCount(totals.totalInvoices) : undefined}
            hint="All time"
            loading={summaryLoading}
          />
          <KpiCard
            tone="lavender"
            icon={<IconReceipt2 size={24} stroke={1.8} />}
            label="Total billed"
            value={totals ? formatMoney(Math.round(totals.totalBilledAmount)) : undefined}
            hint="All time, incl. delivery"
            loading={summaryLoading}
          />
          <KpiCard
            tone="peach"
            icon={<IconCash size={24} stroke={1.8} />}
            label="Cash on delivery"
            value={totals ? formatCount(totals.codCount) : undefined}
            hint="Invoices"
            loading={summaryLoading}
          />
          <KpiCard
            tone="sky"
            icon={<IconCreditCard size={24} stroke={1.8} />}
            label="Online payment"
            value={totals ? formatCount(totals.onlineCount) : undefined}
            hint="Invoices"
            loading={summaryLoading}
          />
        </SimpleGrid>
      )}

      <ListCard
        title="All invoices"
        icon={<IconReceipt size={18} color="var(--mo-color-secondary-8)" aria-hidden />}
        subtitle={meta ? pluralize(meta.total, activeFilters > 0 ? "matching invoice" : "invoice") : "Loading invoices…"}
        filters={
          <>
            <TextInput
              aria-label="Search invoices"
              placeholder="Invoice or order no., name, phone"
              leftSection={<IconSearch size={16} aria-hidden />}
              radius="xl"
              value={search}
              onChange={(event) => setSearchDraft({ source: urlQuery, text: event.currentTarget.value })}
              w={{ base: "100%", sm: 300 }}
            />
            <OptionalDateRange label="Issued" value={range} onChange={setRange} />
            <Select
              aria-label="Payment status"
              data={PAYMENT_STATUS_OPTIONS}
              value={paymentStatus}
              allowDeselect={false}
              onChange={(value) => setPaymentStatus(ADMIN_PAYMENT_STATUSES.find((item) => item === value) ?? "ALL")}
              w={{ base: "100%", xs: 190 }}
              radius="xl"
            />
            <Select
              aria-label="Payment method"
              data={PAYMENT_METHOD_OPTIONS}
              value={paymentMethod}
              allowDeselect={false}
              onChange={(value) => setPaymentMethod(ADMIN_PAYMENT_METHODS.find((item) => item === value) ?? "ALL")}
              w={{ base: "100%", xs: 200 }}
              radius="xl"
            />
          </>
        }
        activeFilterCount={activeFilters}
        onResetFilters={clearFilters}
      >
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
          minWidth={1040}
          emptyIcon={<IconReceipt stroke={1.6} />}
          emptyTitle={activeFilters > 0 ? "No invoices match these filters" : "No invoices yet"}
          emptyDescription={
            activeFilters > 0
              ? "Try different filters or clear them."
              : "Invoices are generated in the background after checkout and appear here once ready."
          }
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
                  itemLabel: "invoices",
                }
              : undefined
          }
        />
      </ListCard>

      <InvoiceDetailDrawer
        invoiceId={detailId}
        onClose={() => setParams({ invoiceId: null })}
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
