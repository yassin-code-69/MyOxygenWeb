"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Anchor, Button, CloseButton, Grid, Stack, Text, TextInput } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { IconAlertTriangle, IconInfoCircle, IconPercentage, IconReceiptRefund, IconSearch, IconShoppingCartX } from "@tabler/icons-react";
import { usePaymentOrders, usePaymentSummary, useRefundStatusGap } from "../../../hooks/admin/use-payments";
import { useCan } from "../../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../../types/auth";
import { DataTable } from "../DataTable";
import { FilterBar } from "../FilterBar";
import { QueryError } from "../QueryError";
import { formatCount, formatMoney, formatPercent, pluralize } from "../format";
import { DateRangePicker, KpiCard, PageHeader, formatRangeDates } from "../kit";
import { MANAGEMENT_GRID_BREAKPOINTS } from "../customers/CustomerKpis";
import { REFUND_COLUMNS } from "./payment-columns";
import { readPositiveInt, useUrlDateRange, useUrlParams } from "./url-state";

const DEFAULT_LIMIT = 20;

/**
 * `/admin/payments/refunds` (ORDERS_READ): orders placed in the period whose
 * payment was refunded. Refunds themselves are issued from the order page
 * (DELIVERED → REFUNDED, REFUNDS_APPROVE). URL state: `?range` / `?from&to`,
 * `?q`, `?page`, `?limit`.
 */
export function RefundsView() {
  const { searchParams, setParams } = useUrlParams();
  const [range, setRange] = useUrlDateRange("last30");
  const canApprove = useCan(PERMISSIONS.REFUNDS_APPROVE);

  const q = searchParams.get("q") ?? "";
  const page = readPositiveInt(searchParams.get("page"), 1);
  const limit = readPositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, 100);
  const [search, setSearch] = useState(q);
  const pushSearch = useDebouncedCallback((value: string) => setParams({ q: value.trim(), page: null }), 300);

  const summary = usePaymentSummary(range);
  const list = usePaymentOrders({ page, limit, range, paymentStatus: "REFUNDED", q });
  const unmatched = useRefundStatusGap(range);
  const s = summary.data;
  const summaryLoading = summary.isLoading && !s;
  const rangeText = formatRangeDates(range);

  const refundedOrders = s?.byStatus.find((row) => row.status === "REFUNDED")?.orders ?? 0;
  const placedOrders = s ? s.byStatus.reduce((sum, row) => sum + row.orders, 0) : 0;
  const refundRate = placedOrders > 0 ? (refundedOrders / placedOrders) * 100 : 0;
  const listTotal = list.data && !q ? list.data.meta.total : null;

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconReceiptRefund size={20} />}
        title="Refunds"
        subtitle="Orders placed in the period whose payment was given back to the customer."
        mb={0}
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <Alert color="info" variant="light" radius="md" icon={<IconInfoCircle size={18} aria-hidden />} title="How refunds work">
        <Text size="sm">
          Refunds are issued from the order itself: open a delivered order and choose “Mark as refunded”. The payment status changes to Refunded and the
          order leaves your revenue.{" "}
          {canApprove
            ? "Your role can approve refunds."
            : "Your role can't approve refunds — ask an order manager or the store owner to do it."}
        </Text>
        <Anchor component={Link} href="/admin/orders?status=DELIVERED" size="sm" fw={600} mt={4} display="inline-block">
          Find delivered orders
        </Anchor>
      </Alert>

      {summary.error && !s ? (
        <QueryError error={summary.error} onRetry={() => void summary.mutate()} permission={PERMISSIONS.ORDERS_READ} title="We couldn't load the refund totals" />
      ) : (
        <Grid type="container" breakpoints={MANAGEMENT_GRID_BREAKPOINTS} gap="md">
          <Grid.Col span={{ base: 12, xs: 6, lg: 4 }}>
            <KpiCard
              tone="rose"
              icon={<IconReceiptRefund size={24} stroke={1.8} />}
              label="Refunded Amount"
              value={s ? formatMoney(Math.round(s.refunded)) : undefined}
              hint={`Orders placed ${rangeText}`}
              loading={summaryLoading}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, xs: 6, lg: 4 }}>
            <KpiCard
              tone="lavender"
              icon={<IconShoppingCartX size={24} stroke={1.8} />}
              label="Refunded Orders"
              value={s ? formatCount(listTotal ?? refundedOrders) : undefined}
              hint={s && refundedOrders > 0 ? `Avg ${formatMoney(Math.round(s.refunded / refundedOrders))} per refund` : "No refunds in this period"}
              loading={summaryLoading}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, xs: 12, lg: 4 }}>
            <KpiCard
              tone="peach"
              icon={<IconPercentage size={24} stroke={1.8} />}
              label="Refund Rate"
              value={s ? formatPercent(refundRate) : undefined}
              hint={s ? `${pluralize(refundedOrders, "refund")} out of ${pluralize(placedOrders, "order")} (not cancelled)` : undefined}
              loading={summaryLoading}
            />
          </Grid.Col>
        </Grid>
      )}

      {unmatched !== null && unmatched > 0 ? (
        <Alert color="warning" variant="light" radius="md" icon={<IconAlertTriangle size={18} aria-hidden />}>
          <Text size="sm">
            {pluralize(unmatched, "order")} in this period {unmatched === 1 ? "is" : "are"} marked Refunded but {unmatched === 1 ? "its" : "their"} payment
            isn&apos;t. Check {unmatched === 1 ? "it" : "them"} on the orders page.
          </Text>
          <Anchor component={Link} href="/admin/orders?status=REFUNDED" size="sm" fw={600}>
            Open refunded orders
          </Anchor>
        </Alert>
      ) : null}

      <div>
        <FilterBar>
          <TextInput
            aria-label="Search refunds"
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
        </FilterBar>

        <DataTable
          label="Refunded orders"
          columns={REFUND_COLUMNS}
          rows={list.data?.items}
          getRowKey={(order) => order.id}
          loading={list.isLoading}
          refreshing={list.isValidating}
          error={list.error}
          onRetry={() => void list.mutate()}
          permission={PERMISSIONS.ORDERS_READ}
          minWidth={900}
          skeletonRows={5}
          emptyIcon={<IconReceiptRefund stroke={1.6} />}
          emptyTitle={q ? "No refunds match your search" : "No refunds in this period"}
          emptyDescription={q ? "Try an order number or the customer's phone." : "Good news — nothing was refunded. Pick a longer period to see older refunds."}
          emptyAction={
            q ? (
              <Button
                variant="light"
                color="secondaryGreen"
                radius="xl"
                onClick={() => {
                  setSearch("");
                  pushSearch.cancel();
                  setParams({ q: null, page: null });
                }}
              >
                Clear search
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
                  itemLabel: "refunds",
                }
              : undefined
          }
        />
      </div>
    </Stack>
  );
}
