"use client";

import { useState } from "react";
import { Box, Button, CloseButton, Grid, Select, Stack, TextInput } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import {
  IconArrowsExchange,
  IconCash,
  IconCreditCardOff,
  IconReceiptRefund,
  IconSearch,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { STATUS_CONFIG } from "../../StatusBadge";
import { usePaymentOrders, usePaymentSummary } from "../../../hooks/admin/use-payments";
import { PERMISSIONS } from "../../../types/auth";
import { ADMIN_PAYMENT_METHODS, ADMIN_PAYMENT_STATUSES } from "../../../types/admin";
import { DataTable } from "../DataTable";
import { FilterBar } from "../FilterBar";
import { QueryError } from "../QueryError";
import { formatMoney, paymentMethodLabel, pluralize } from "../format";
import { DateRangePicker, DonutWithLegend, KpiCard, PageHeader, SectionCard, formatRangeDates } from "../kit";
import { MANAGEMENT_GRID_BREAKPOINTS } from "../customers/CustomerKpis";
import { TRANSACTION_COLUMNS } from "./payment-columns";
import { PaymentStatusBreakdown } from "./PaymentStatusBreakdown";
import { dateRangePatch, readEnum, readPositiveInt, useUrlDateRange, useUrlParams } from "./url-state";

const DEFAULT_LIMIT = 20;
const STATUS_FILTERS = ["ALL", ...ADMIN_PAYMENT_STATUSES] as const;
const METHOD_FILTERS = ["ALL", ...ADMIN_PAYMENT_METHODS] as const;

const METHOD_COLORS = { COD: "secondaryGreen.6", ONLINE_GATEWAY: "accentPurple.6" } as const;

/**
 * `/admin/payments` — Transactions (ORDERS_READ). Figures cover orders placed
 * in the period. URL state: `?range` / `?from&to` (default last 30 days),
 * `?paymentStatus`, `?paymentMethod`, `?q`, `?page`, `?limit`.
 */
export function PaymentsView() {
  const { searchParams, setParams, hrefWith } = useUrlParams();
  const [range, setRange] = useUrlDateRange("last30");

  const paymentStatus = readEnum(searchParams.get("paymentStatus"), STATUS_FILTERS, "ALL");
  const paymentMethod = readEnum(searchParams.get("paymentMethod"), METHOD_FILTERS, "ALL");
  const q = searchParams.get("q") ?? "";
  const page = readPositiveInt(searchParams.get("page"), 1);
  const limit = readPositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, 100);

  const [search, setSearch] = useState(q);
  const pushSearch = useDebouncedCallback((value: string) => setParams({ q: value.trim(), page: null }), 300);

  const summary = usePaymentSummary(range);
  const list = usePaymentOrders({ page, limit, range, paymentStatus, paymentMethod, q });
  const s = summary.data;
  const summaryLoading = summary.isLoading && !s;
  const rangeText = formatRangeDates(range);
  const statusCount = (status: (typeof ADMIN_PAYMENT_STATUSES)[number]) => s?.byStatus.find((row) => row.status === status)?.orders ?? 0;

  const filterHref = (patch: Record<string, string | null>) => `${hrefWith({ ...patch, page: null })}#transactions`;
  const refundsHref = (() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(dateRangePatch(range, "last30"))) {
      if (value !== null && value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    }
    const query = params.toString();
    return query ? `/admin/payments/refunds?${query}` : "/admin/payments/refunds";
  })();

  const activeFilters = (q ? 1 : 0) + (paymentStatus !== "ALL" ? 1 : 0) + (paymentMethod !== "ALL" ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    pushSearch.cancel();
    setParams({ q: null, paymentStatus: null, paymentMethod: null, page: null });
  };

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconArrowsExchange size={20} />}
        title="Transactions"
        subtitle="Payments for orders placed in the period: money in, cash still with couriers, refunds and failures."
        mb={0}
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      {summary.error && !s ? (
        <QueryError error={summary.error} onRetry={() => void summary.mutate()} permission={PERMISSIONS.ORDERS_READ} title="We couldn't load the payment totals" />
      ) : (
        <>
          <Grid type="container" breakpoints={MANAGEMENT_GRID_BREAKPOINTS} gap="md">
            <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
              <KpiCard
                tone="mint"
                icon={<IconCash size={24} stroke={1.8} />}
                label="Collected"
                value={s ? formatMoney(Math.round(s.collected)) : undefined}
                hint={s ? `${pluralize(statusCount("PAID"), "paid order")}` : undefined}
                href={filterHref({ paymentStatus: "PAID", paymentMethod: null })}
                linkLabel="Show paid"
                loading={summaryLoading}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
              <KpiCard
                tone="peach"
                icon={<IconTruckDelivery size={24} stroke={1.8} />}
                label="Pending COD"
                value={s ? formatMoney(Math.round(s.pendingCod)) : undefined}
                hint="Cash the couriers still have to collect"
                href={filterHref({ paymentStatus: "UNPAID", paymentMethod: "COD" })}
                linkLabel="Show unpaid COD"
                loading={summaryLoading}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
              <KpiCard
                tone="lavender"
                icon={<IconReceiptRefund size={24} stroke={1.8} />}
                label="Refunded"
                value={s ? formatMoney(Math.round(s.refunded)) : undefined}
                hint="Paid back to customers"
                href={refundsHref}
                linkLabel="View refunds"
                loading={summaryLoading}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
              <KpiCard
                tone="rose"
                icon={<IconCreditCardOff size={24} stroke={1.8} />}
                label="Failed"
                value={s ? formatMoney(Math.round(s.failed)) : undefined}
                hint="Failed payments, incl. cancelled orders"
                href={filterHref({ paymentStatus: "FAILED", paymentMethod: null })}
                linkLabel="Show failed"
                loading={summaryLoading}
              />
            </Grid.Col>
          </Grid>

          <Grid type="container" breakpoints={MANAGEMENT_GRID_BREAKPOINTS} gap="md">
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <SectionCard title="By payment method" subtitle={`Order amounts by method, excluding cancelled orders · ${rangeText}`}>
                <Box py={4}>
                  <DonutWithLegend
                    data={s?.byMethod.map((row) => ({
                      key: row.method,
                      label: paymentMethodLabel(row.method),
                      value: row.amount,
                      color: METHOD_COLORS[row.method],
                      href: filterHref({ paymentMethod: row.method, paymentStatus: null }),
                    }))}
                    loading={summaryLoading}
                    totalLabel="Total amount"
                    format="currency"
                    size={200}
                    thickness={24}
                    emptyTitle="No payments in this period"
                    emptyDescription="Totals appear once orders are placed."
                  />
                </Box>
              </SectionCard>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <SectionCard title="By payment status" subtitle={`Amount and orders; cancelled orders count only when money moved or a payment failed · ${rangeText}`}>
                <PaymentStatusBreakdown
                  rows={s?.byStatus}
                  loading={summaryLoading}
                  hrefFor={(status) => filterHref({ paymentStatus: status, paymentMethod: null })}
                />
              </SectionCard>
            </Grid.Col>
          </Grid>
        </>
      )}

      <div id="transactions" style={{ scrollMarginTop: 88 }}>
        <FilterBar activeCount={activeFilters} onReset={clearFilters}>
          <TextInput
            aria-label="Search transactions"
            placeholder="Order no., name, phone or email"
            radius="xl"
            leftSection={<IconSearch size={16} aria-hidden />}
            rightSection={
              search ? (
                <CloseButton
                  size="sm"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    pushSearch.cancel();
                    setParams({ q: null, page: null });
                  }}
                />
              ) : null
            }
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              pushSearch(event.currentTarget.value);
            }}
            style={{ flex: "1 1 240px" }}
            maw={360}
          />
          <Select
            aria-label="Payment status"
            radius="xl"
            w={170}
            allowDeselect={false}
            data={STATUS_FILTERS.map((value) => ({ value, label: value === "ALL" ? "All payment statuses" : STATUS_CONFIG[value].label }))}
            value={paymentStatus}
            onChange={(value) => setParams({ paymentStatus: value && value !== "ALL" ? value : null, page: null })}
          />
          <Select
            aria-label="Payment method"
            radius="xl"
            w={180}
            allowDeselect={false}
            data={METHOD_FILTERS.map((value) => ({ value, label: value === "ALL" ? "All methods" : paymentMethodLabel(value) }))}
            value={paymentMethod}
            onChange={(value) => setParams({ paymentMethod: value && value !== "ALL" ? value : null, page: null })}
          />
        </FilterBar>

        <DataTable
          label="Transactions"
          columns={TRANSACTION_COLUMNS}
          rows={list.data?.items}
          getRowKey={(order) => order.id}
          loading={list.isLoading}
          refreshing={list.isValidating}
          error={list.error}
          onRetry={() => void list.mutate()}
          permission={PERMISSIONS.ORDERS_READ}
          minWidth={960}
          emptyIcon={<IconArrowsExchange stroke={1.6} />}
          emptyTitle={activeFilters > 0 ? "No transactions match these filters" : "No orders in this period"}
          emptyDescription={activeFilters > 0 ? "Try another status or method, or widen the date range." : "Pick a longer period to see older payments."}
          emptyAction={
            activeFilters > 0 ? (
              <Button variant="light" color="secondaryGreen" radius="xl" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
          pagination={
            list.data
              ? {
                  page: list.data.meta.page,
                  totalPages: list.data.meta.totalPages,
                  total: list.data.meta.total,
                  limit: list.data.meta.limit,
                  onPageChange: (next) => setParams({ page: next > 1 ? next : null }),
                  onLimitChange: (next) => setParams({ limit: next === DEFAULT_LIMIT ? null : next, page: null }),
                  itemLabel: "transactions",
                }
              : undefined
          }
        />
      </div>
    </Stack>
  );
}
