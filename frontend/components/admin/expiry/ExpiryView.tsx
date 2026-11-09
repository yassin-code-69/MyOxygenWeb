"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Box, Button, Group, SegmentedControl, SimpleGrid, Stack, Text, VisuallyHidden } from "@mantine/core";
import {
  IconAlarm,
  IconCalendarExclamation,
  IconCircleCheck,
  IconCircleX,
  IconCoins,
  IconHourglassHigh,
  IconPackages,
  IconStack2,
  IconTrash,
} from "@tabler/icons-react";
import { useProductIndex, type AdminProductIndex } from "../../../hooks/admin/use-admin-products";
import { EXPIRY_WINDOWS, useExpiredStock, useExpiringBatches, withinDays, type ExpiryWindow } from "../../../hooks/admin/use-expiry";
import { usePaging, useUrlParams } from "../../../hooks/admin/use-ops-url-state";
import { useCan } from "../../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../../types/auth";
import type { AdminBatchDTO } from "../../../types/admin";
import { EmptyState } from "../../EmptyState";
import { BatchProductCell, DaysLeftBadge } from "../batches/batch-ui";
import { DataTable, type DataTableColumn } from "../DataTable";
import { formatCalendarDate, formatCount, formatMoney, pluralize } from "../format";
import { KpiCard, PageHeader } from "../kit";
import { ListCard } from "../products/ListCard";
import { QueryError } from "../QueryError";
import { ScrapBatchModal } from "./ScrapBatchModal";

interface RiskTotals {
  units: number;
  /** Units × landed cost for the batches whose product cost is known. */
  value: number;
  /** Batches whose cost is unknown (product missing from the catalog index). */
  unknownCost: number;
}

function riskOf(rows: readonly AdminBatchDTO[], index: AdminProductIndex | undefined): RiskTotals {
  let units = 0;
  let value = 0;
  let unknownCost = 0;
  for (const batch of rows) {
    units += batch.availableQuantity;
    const cost = index?.byId.get(batch.productId)?.costPrice;
    if (cost === undefined) {
      unknownCost += 1;
    } else {
      value += batch.availableQuantity * cost;
    }
  }
  return { units, value, unknownCost };
}

function unitCostOf(batch: AdminBatchDTO, index: AdminProductIndex | undefined): number | null {
  return index?.byId.get(batch.productId)?.costPrice ?? null;
}

/**
 * `/admin/expiry` — FEFO control room: expired stock to write off, and stock
 * that expires within 7 / 30 / 60 / 90 days, with units and value (at landed
 * cost) at risk.
 */
export function ExpiryView() {
  const { searchParams, setParams } = useUrlParams();
  const canAdjust = useCan(PERMISSIONS.STOCK_ADJUST);
  const canProducts = useCan(PERMISSIONS.PRODUCTS_READ);
  const daysParam = searchParams.get("days");
  const days: ExpiryWindow = EXPIRY_WINDOWS.find((value) => String(value) === daysParam) ?? 30;

  const expiring = useExpiringBatches(days);
  const expired = useExpiredStock();
  const { data: index, isLoading: indexLoading } = useProductIndex();
  const [scrapping, setScrapping] = useState<AdminBatchDTO | null>(null);

  const expiringRows = expiring.data?.items;
  const expiredRows = expired.data?.items;
  const windowRows = useMemo(() => (expiringRows ? withinDays(expiringRows, days) : undefined), [expiringRows, days]);
  const paging = usePaging(String(days));
  const pageRows = windowRows?.slice((paging.page - 1) * paging.limit, paging.page * paging.limit);

  const week = expiringRows ? withinDays(expiringRows, 7) : undefined;
  const month = expiringRows ? withinDays(expiringRows, 30) : undefined;
  const expiredRisk = expiredRows ? riskOf(expiredRows, index) : null;
  const windowRisk = windowRows ? riskOf(windowRows, index) : null;
  const atRisk =
    expiredRisk && windowRisk
      ? {
          units: expiredRisk.units + windowRisk.units,
          value: expiredRisk.value + windowRisk.value,
          unknownCost: expiredRisk.unknownCost + windowRisk.unknownCost,
        }
      : null;

  const loading = (expiring.isLoading && !expiring.data) || (expired.isLoading && !expired.data);
  const valueLoading = loading || (canProducts && indexLoading && !index);
  const failed = (expiring.error && !expiring.data) || (expired.error && !expired.data);

  const viewBatchHref = (batch: AdminBatchDTO) =>
    `/admin/batches?productId=${encodeURIComponent(batch.productId)}${batch.daysUntilExpiry <= 0 ? "&status=EXPIRED" : ""}`;

  const valueCell = (batch: AdminBatchDTO) => {
    const cost = unitCostOf(batch, index);
    return (
      <Box ta="right">
        <Text size="sm" fw={600} className="mo-tabular-nums" c="var(--mo-color-text)" style={{ whiteSpace: "nowrap" }}>
          {cost === null ? "—" : formatMoney(batch.availableQuantity * cost)}
        </Text>
        {cost !== null ? (
          <Text size="xs" c="var(--mo-color-text-muted)" className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
            {formatMoney(cost)} / unit
          </Text>
        ) : null}
      </Box>
    );
  };

  const unitsCell = (batch: AdminBatchDTO) => (
    <Text size="sm" ta="right" className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
      <strong>{formatCount(batch.availableQuantity)}</strong>
      <Text component="span" size="xs" c="var(--mo-color-text-muted)">
        {" "}
        / {formatCount(batch.initialQuantity)}
      </Text>
    </Text>
  );

  const baseColumns: DataTableColumn<AdminBatchDTO>[] = [
    {
      key: "product",
      header: "Product",
      width: 280,
      skeletonWidth: "80%",
      cell: (batch) => <BatchProductCell productId={batch.productId} title={batch.productTitle} sku={batch.sku} index={index} />,
    },
    {
      key: "batch",
      header: "Batch",
      width: 160,
      cell: (batch) => (
        <Text size="sm" fw={600} ff="var(--mo-font-monospace)" style={{ whiteSpace: "nowrap" }}>
          {batch.batchNumber}
        </Text>
      ),
    },
    {
      key: "expiry",
      header: "Expiry",
      width: 130,
      cell: (batch) => (
        <Text size="sm" fw={600} c="var(--mo-color-text)" style={{ whiteSpace: "nowrap" }}>
          {formatCalendarDate(batch.expiryDate)}
        </Text>
      ),
    },
    {
      key: "days",
      header: "Days left",
      width: 190,
      cell: (batch) => <DaysLeftBadge days={batch.daysUntilExpiry} />,
    },
    { key: "units", header: "Units", align: "right", width: 100, cell: unitsCell },
    { key: "value", header: "Value at cost", align: "right", width: 130, cell: valueCell },
  ];

  const expiredColumns: DataTableColumn<AdminBatchDTO>[] = [
    ...baseColumns,
    {
      key: "actions",
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: "right",
      width: 190,
      skeletonWidth: 120,
      cell: (batch) => (
        <Group gap={6} justify="flex-end" wrap="nowrap">
          {canAdjust ? (
            <Button
              size="compact-sm"
              radius="xl"
              variant="light"
              color="danger"
              leftSection={<IconTrash size={14} aria-hidden />}
              onClick={() => setScrapping(batch)}
              aria-label={`Scrap expired stock of ${batch.productTitle}, batch ${batch.batchNumber}`}
            >
              Scrap
            </Button>
          ) : null}
          <Button
            size="compact-sm"
            radius="xl"
            variant="light"
            color="info"
            component={Link}
            href={viewBatchHref(batch)}
            aria-label={`View batch ${batch.batchNumber}`}
          >
            View batch
          </Button>
        </Group>
      ),
    },
  ];

  const expiringColumns: DataTableColumn<AdminBatchDTO>[] = [
    ...baseColumns,
    {
      key: "actions",
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: "right",
      width: 120,
      skeletonWidth: 80,
      cell: (batch) => (
        <Button
          size="compact-sm"
          radius="xl"
          variant="light"
          color="info"
          component={Link}
          href={viewBatchHref(batch)}
          aria-label={`View batch ${batch.batchNumber}`}
        >
          View batch
        </Button>
      ),
    },
  ];

  /** "2 batches · 63 units" under a batch count. */
  const batchesHint = (rows: readonly AdminBatchDTO[] | undefined) =>
    rows
      ? `${rows.length === 1 ? "batch" : "batches"} · ${pluralize(
          rows.reduce((sum, batch) => sum + batch.availableQuantity, 0),
          "unit",
        )}`
      : undefined;

  return (
    <Stack gap="lg">
      <PageHeader
        mb={0}
        icon={<IconHourglassHigh size={20} />}
        title="Expiry / FEFO"
        subtitle="First-expired, first-out: checkout always sells the batch that expires soonest and never sells expired stock. Write off what has expired and move stock before it does. Days count in Dhaka time."
        actions={
          <>
            <Group gap={8} wrap="nowrap">
              <Text size="sm" fw={500} c="var(--mo-color-text-secondary)" id="expiry-window-label">
                Window
              </Text>
              <SegmentedControl
                radius="xl"
                color="secondaryGreen.8"
                value={String(days)}
                onChange={(value) => setParams({ days: value === "30" ? null : value })}
                data={EXPIRY_WINDOWS.map((value) => ({ value: String(value), label: `${value} days` }))}
                aria-labelledby="expiry-window-label"
              />
            </Group>
            <Button component={Link} href="/admin/batches" variant="default" radius="xl" leftSection={<IconStack2 size={16} aria-hidden />}>
              Batch Inspector
            </Button>
          </>
        }
      />

      {failed ? (
        <QueryError
          error={expiring.error ?? expired.error}
          onRetry={() => {
            void expiring.mutate();
            void expired.mutate();
          }}
          permission={PERMISSIONS.BATCHES_MANAGE}
          title="We couldn't load the expiry data"
        />
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 5 }} spacing="md">
          <KpiCard
            tone="rose"
            icon={<IconCircleX size={24} stroke={1.8} />}
            label="Expired"
            value={expiredRows ? formatCount(expiredRows.length) : undefined}
            hint={expiredRows ? `${batchesHint(expiredRows)} · can't be sold` : undefined}
            loading={loading}
          />
          <KpiCard
            tone="peach"
            icon={<IconAlarm size={24} stroke={1.8} />}
            label="Next 7 days"
            value={week ? formatCount(week.length) : undefined}
            hint={batchesHint(week)}
            loading={loading}
          />
          <KpiCard
            tone="lavender"
            icon={<IconCalendarExclamation size={24} stroke={1.8} />}
            label="Next 30 days"
            value={month ? formatCount(month.length) : undefined}
            hint={batchesHint(month)}
            loading={loading}
          />
          <KpiCard
            tone="sky"
            icon={<IconPackages size={24} stroke={1.8} />}
            label="Units at risk"
            value={atRisk ? formatCount(atRisk.units) : undefined}
            hint={`Expired + next ${days} days`}
            loading={loading}
          />
          <KpiCard
            tone="mint"
            icon={<IconCoins size={24} stroke={1.8} />}
            label="Value at risk"
            value={atRisk && canProducts ? formatMoney(Math.round(atRisk.value)) : canProducts ? undefined : "—"}
            hint={
              !canProducts
                ? "Needs product access"
                : atRisk && atRisk.unknownCost > 0
                  ? `At landed cost · ${pluralize(atRisk.unknownCost, "batch", "batches")} without a cost`
                  : "At landed cost"
            }
            loading={valueLoading}
          />
        </SimpleGrid>
      )}

      <ListCard
        title="Expired — write off"
        icon={<IconCircleX size={18} color="var(--mo-color-danger-8)" aria-hidden />}
        subtitle={
          expiredRows
            ? expiredRows.length > 0
              ? `${pluralize(expiredRows.length, "batch", "batches")} past expiry still ${expiredRows.length === 1 ? "holds" : "hold"} stock. Expired units are never sold; scrap them to keep stock counts true.`
              : "Nothing has expired on the shelf."
            : "Loading expired batches…"
        }
      >
        {expiredRows && expiredRows.length === 0 ? (
          <EmptyState
            withCard={false}
            size="sm"
            color="secondaryGreen"
            icon={<IconCircleCheck stroke={1.6} />}
            title="No expired stock"
            description="Every batch past its expiry date is empty. Nothing to write off."
          />
        ) : (
          <DataTable
            label="Expired batches with stock"
            columns={expiredColumns}
            rows={expiredRows}
            getRowKey={(batch) => batch.id}
            getRowStyle={() => ({ accent: "var(--mantine-color-danger-6)" })}
            loading={expired.isLoading}
            error={expired.error}
            onRetry={() => void expired.mutate()}
            permission={PERMISSIONS.BATCHES_MANAGE}
            minWidth={1080}
            skeletonRows={3}
            maxHeight="min(60dvh, 560px)"
          />
        )}
      </ListCard>

      <ListCard
        title={`Expiring within ${days} days`}
        icon={<IconCalendarExclamation size={18} color="var(--mo-color-warning-8)" aria-hidden />}
        subtitle={
          windowRows && windowRisk
            ? `${pluralize(windowRows.length, "batch", "batches")} · ${formatCount(windowRisk.units)} units · soonest first. Sell these first: run a discount, bundle them, or return them to the supplier.`
            : "Loading batches…"
        }
      >
        {windowRows && windowRows.length === 0 ? (
          <EmptyState
            withCard={false}
            size="sm"
            color="secondaryGreen"
            icon={<IconCalendarExclamation stroke={1.6} />}
            title={`Nothing expires in the next ${days} days`}
            description={days < 90 ? "Widen the window to plan further ahead." : "Every batch with stock has more than 90 days of shelf life left."}
            action={
              days < 90 ? (
                <Button variant="light" radius="xl" onClick={() => setParams({ days: "90" })}>
                  Show 90 days
                </Button>
              ) : null
            }
          />
        ) : (
          <DataTable
            label={`Batches expiring within ${days} days`}
            columns={expiringColumns}
            rows={pageRows}
            getRowKey={(batch) => batch.id}
            getRowStyle={(batch) =>
              batch.daysUntilExpiry <= 7
                ? { accent: "var(--mantine-color-danger-6)" }
                : batch.daysUntilExpiry <= 30
                  ? { accent: "var(--mantine-color-warning-6)" }
                  : undefined
            }
            loading={expiring.isLoading}
            refreshing={expiring.isLoading && Boolean(expiring.data)}
            error={expiring.error}
            onRetry={() => void expiring.mutate()}
            permission={PERMISSIONS.BATCHES_MANAGE}
            minWidth={1010}
            skeletonRows={5}
            pagination={
              windowRows && windowRows.length > 0
                ? {
                    page: paging.page,
                    totalPages: Math.max(1, Math.ceil(windowRows.length / paging.limit)),
                    total: windowRows.length,
                    limit: paging.limit,
                    onPageChange: paging.setPage,
                    onLimitChange: paging.setLimit,
                    itemLabel: "batches",
                  }
                : undefined
            }
          />
        )}
      </ListCard>

      {expiring.data?.truncated || expired.data?.truncated ? (
        <Text size="xs" c="var(--mo-color-text-secondary)">
          Showing the first 1,000 batches of a list; totals cover those batches only.
        </Text>
      ) : null}

      <ScrapBatchModal batch={scrapping} unitCost={scrapping ? unitCostOf(scrapping, index) : null} onClose={() => setScrapping(null)} />
    </Stack>
  );
}
