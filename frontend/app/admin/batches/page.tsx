"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Menu,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconAdjustments,
  IconAlertTriangle,
  IconBoxSeam,
  IconCalendarTime,
  IconCircleCheck,
  IconCircleX,
  IconDotsVertical,
  IconEye,
  IconFileSpreadsheet,
  IconHourglassHigh,
  IconPackageImport,
  IconSearch,
  IconStack2,
  IconTrash,
} from "@tabler/icons-react";
import { StatusBadge } from "../../../components/StatusBadge";
import { AdjustStockModal } from "../../../components/admin/batches/AdjustStockModal";
import { BatchProductCell, DaysLeftBadge } from "../../../components/admin/batches/batch-ui";
import { ImportBatchModal } from "../../../components/admin/batches/ImportBatchModal";
import { DataTable, type DataTableColumn, type DataTableRowStyle } from "../../../components/admin/DataTable";
import { MeterBar } from "../../../components/admin/MeterBar";
import { ProductPicker, type ProductOption } from "../../../components/admin/ProductPicker";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import { formatCalendarDate, formatCount, pluralize } from "../../../components/admin/format";
import { KpiCard, PageHeader } from "../../../components/admin/kit";
import { CountTabs, type CountTab } from "../../../components/admin/products/CountTabs";
import { HiddenLabelField, ListCard } from "../../../components/admin/products/ListCard";
import { useAdminProduct, useProductIndex } from "../../../hooks/admin/use-admin-products";
import { useBatchKpis, useBatches } from "../../../hooks/admin/use-batches";
import { pickParam, usePaging, useUrlParams } from "../../../hooks/admin/use-ops-url-state";
import { useCan } from "../../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../../types/auth";
import { BATCH_HEALTH_STATUSES, type AdminBatchDTO, type BatchHealthStatus } from "../../../types/admin";

type StatusFilter = BatchHealthStatus | "ALL";

const STATUS_FILTERS = ["ALL", ...BATCH_HEALTH_STATUSES] as const satisfies readonly StatusFilter[];

const ROW_STYLES: Record<BatchHealthStatus, DataTableRowStyle | undefined> = {
  EXPIRED: { background: "var(--mantine-color-danger-0)", accent: "var(--mantine-color-danger-6)" },
  EXPIRING_SOON: { background: "var(--mantine-color-warning-0)", accent: "var(--mantine-color-warning-6)" },
  HEALTHY: undefined,
};

const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: "All",
  EXPIRED: "Expired",
  EXPIRING_SOON: "Expiring soon",
  HEALTHY: "Healthy",
};

export default function AdminBatchesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.BATCHES_MANAGE}>
      <BatchesView />
    </RequirePermission>
  );
}

function toOption(product: { id: string; title: string; sku: string; listingStatus: ProductOption["listingStatus"] } | undefined): ProductOption | null {
  return product ? { id: product.id, title: product.title, sku: product.sku, listingStatus: product.listingStatus } : null;
}

function BatchesView() {
  const { searchParams, setParams } = useUrlParams();
  const canAdjust = useCan(PERMISSIONS.STOCK_ADJUST);
  const canProducts = useCan(PERMISSIONS.PRODUCTS_READ);

  // Deep links: ?status= (tab), ?productId= (filter), ?import=<productId> (import modal).
  const status = pickParam<StatusFilter>(searchParams.get("status"), STATUS_FILTERS, "ALL");
  const productId = searchParams.get("productId");
  const importParam = searchParams.get("import");
  const [importOpened, setImportOpened] = useState(false);
  const importOpen = importOpened || importParam !== null;

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [adjusting, setAdjusting] = useState<AdminBatchDTO | null>(null);

  // Labels for products preselected through the URL.
  const { data: importProduct } = useAdminProduct(importParam);
  const { data: filterProduct } = useAdminProduct(productId);
  const { data: productIndex } = useProductIndex();

  const paging = usePaging(JSON.stringify({ status, q: debouncedSearch, productId, inStockOnly }));
  const list = useBatches({
    page: paging.page,
    limit: paging.limit,
    status: status === "ALL" ? null : status,
    q: debouncedSearch,
    productId,
    inStockOnly,
  });
  const kpis = useBatchKpis();
  const summary = list.data?.meta.summary;

  const activeFilters = (search.trim() ? 1 : 0) + (productId ? 1 : 0) + (inStockOnly ? 1 : 0);
  const filtered = status !== "ALL" || activeFilters > 0;
  const clearFilters = () => {
    setSearch("");
    setInStockOnly(false);
    setParams({ productId: null });
  };

  const closeImport = () => {
    setImportOpened(false);
    if (importParam !== null) {
      setParams({ import: null });
    }
  };

  const tabs: CountTab<StatusFilter>[] = STATUS_FILTERS.map((value) => ({
    value,
    label: STATUS_LABELS[value],
    count: summary ? (value === "ALL" ? summary.EXPIRED + summary.EXPIRING_SOON + summary.HEALTHY : summary[value]) : null,
  }));

  const columns: DataTableColumn<AdminBatchDTO>[] = [
    {
      key: "product",
      header: "Product",
      width: 280,
      skeletonWidth: "80%",
      cell: (batch) => (
        <BatchProductCell productId={batch.productId} title={batch.productTitle} sku={batch.sku} index={productIndex} />
      ),
    },
    {
      key: "batch",
      header: "Batch",
      width: 170,
      cell: (batch) => (
        <Box>
          <Text size="sm" fw={600} ff="var(--mo-font-monospace)" style={{ whiteSpace: "nowrap" }}>
            {batch.batchNumber}
          </Text>
          <Text size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap" }}>
            Made {batch.manufactureDate ? formatCalendarDate(batch.manufactureDate) : "—"}
          </Text>
        </Box>
      ),
    },
    {
      key: "expiry",
      header: "Expiry",
      width: 170,
      cell: (batch) => (
        <Stack gap={4} align="flex-start">
          <Text size="sm" fw={batch.healthStatus === "HEALTHY" ? 500 : 700} c="var(--mo-color-text)" style={{ whiteSpace: "nowrap" }}>
            {formatCalendarDate(batch.expiryDate)}
          </Text>
          <DaysLeftBadge days={batch.daysUntilExpiry} />
        </Stack>
      ),
    },
    {
      key: "quantity",
      header: "Available",
      align: "right",
      width: 150,
      cell: (batch) => (
        <Stack gap={6} align="stretch">
          <Text size="sm" ta="right" className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
            <strong>{formatCount(batch.availableQuantity)}</strong>
            <Text component="span" size="xs" c="var(--mo-color-text-muted)">
              {" "}
              / {formatCount(batch.initialQuantity)}
            </Text>
          </Text>
          <MeterBar
            ratio={batch.initialQuantity > 0 ? batch.availableQuantity / batch.initialQuantity : 0}
            color={batch.healthStatus === "HEALTHY" ? "secondaryGreen" : batch.healthStatus === "EXPIRED" ? "danger" : "warning"}
            height={5}
          />
        </Stack>
      ),
    },
    {
      key: "health",
      header: "Health",
      width: 150,
      cell: (batch) => <StatusBadge status={batch.healthStatus} size="sm" />,
    },
    {
      key: "actions",
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: "right",
      width: 70,
      skeletonWidth: 24,
      cell: (batch) => (
        <Menu position="bottom-end" withinPortal width={230}>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" radius="xl" aria-label={`Actions for batch ${batch.batchNumber}`}>
              <IconDotsVertical size={18} aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {canAdjust && batch.healthStatus === "EXPIRED" && batch.availableQuantity > 0 ? (
              <Menu.Item color="danger" leftSection={<IconTrash size={16} aria-hidden />} onClick={() => setAdjusting(batch)}>
                Write off expired stock
              </Menu.Item>
            ) : null}
            {canAdjust ? (
              <Menu.Item leftSection={<IconAdjustments size={16} aria-hidden />} onClick={() => setAdjusting(batch)}>
                Adjust stock
              </Menu.Item>
            ) : null}
            <Menu.Item
              leftSection={<IconPackageImport size={16} aria-hidden />}
              onClick={() => setParams({ import: batch.productId })}
            >
              Import another batch
            </Menu.Item>
            {canProducts ? (
              <Menu.Item component={Link} href={`/admin/products?productId=${batch.productId}`} leftSection={<IconEye size={16} aria-hidden />}>
                View product
              </Menu.Item>
            ) : null}
            {canAdjust ? (
              <Menu.Item component={Link} href={`/admin/ledger?productId=${batch.productId}`} leftSection={<IconFileSpreadsheet size={16} aria-hidden />}>
                Stock history
              </Menu.Item>
            ) : null}
          </Menu.Dropdown>
        </Menu>
      ),
    },
  ];

  const meta = list.data?.meta;
  const kpiData = kpis.data;
  const kpiLoading = kpis.isLoading && !kpiData;

  return (
    <Stack gap="lg">
      <PageHeader
        mb={0}
        icon={<IconStack2 size={20} />}
        title="Batch Inspector"
        subtitle="Every batch in expiry order (first-expired, first-out). Expiring soon = 30 days or less with stock left. Days count in Dhaka time."
        actions={
          <>
            <Button component={Link} href="/admin/expiry" variant="default" radius="xl" leftSection={<IconHourglassHigh size={16} aria-hidden />}>
              Expiry / FEFO
            </Button>
            <Button color="secondaryGreen.8" radius="xl" leftSection={<IconPackageImport size={16} aria-hidden />} onClick={() => setImportOpened(true)}>
              Import batch
            </Button>
          </>
        }
      />

      {kpis.error && !kpiData ? null : (
        <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
          <KpiCard
            tone="sky"
            icon={<IconBoxSeam size={24} stroke={1.8} />}
            label="Batches tracked"
            value={kpiData ? formatCount(kpiData.total) : undefined}
            hint={kpiData ? `${formatCount(kpiData.withStock)} still hold stock` : undefined}
            loading={kpiLoading}
          />
          <KpiCard
            tone="mint"
            icon={<IconCircleCheck size={24} stroke={1.8} />}
            label="Healthy"
            value={kpiData ? formatCount(kpiData.summary.HEALTHY) : undefined}
            hint="Over 30 days left, or empty"
            loading={kpiLoading}
          />
          <KpiCard
            tone="peach"
            icon={<IconAlertTriangle size={24} stroke={1.8} />}
            label="Expiring ≤ 30 days"
            value={kpiData ? formatCount(kpiData.summary.EXPIRING_SOON) : undefined}
            href="/admin/expiry"
            linkLabel="Plan FEFO"
            hint="With stock left"
            loading={kpiLoading}
          />
          <KpiCard
            tone="rose"
            icon={<IconCircleX size={24} stroke={1.8} />}
            label="Expired"
            value={kpiData ? formatCount(kpiData.summary.EXPIRED) : undefined}
            href={kpiData && kpiData.expiredWithStock > 0 ? "/admin/expiry" : undefined}
            linkLabel="Write off"
            hint={kpiData ? `${formatCount(kpiData.expiredWithStock)} still hold stock` : undefined}
            loading={kpiLoading}
          />
        </SimpleGrid>
      )}

      <ListCard
        title="Batches"
        icon={<IconCalendarTime size={18} color="var(--mo-color-secondary-8)" aria-hidden />}
        subtitle={meta ? `${pluralize(meta.total, filtered ? "matching batch" : "batch", filtered ? "matching batches" : "batches")} · soonest expiry first` : "Loading batches…"}
        tabs={
          <CountTabs label="Batch health" value={status} onChange={(next) => setParams({ status: next === "ALL" ? null : next })} tabs={tabs} />
        }
        filters={
          <>
            <TextInput
              aria-label="Search batches"
              placeholder="Batch number, product or SKU"
              leftSection={<IconSearch size={16} aria-hidden />}
              radius="xl"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              w={{ base: "100%", sm: 280 }}
            />
            <HiddenLabelField w={{ base: "100%", sm: 280 }}>
              <ProductPicker
                label="Product"
                placeholder="All products"
                clearable
                value={productId}
                initialProduct={toOption(filterProduct)}
                onChange={(id) => setParams({ productId: id })}
                w="100%"
                radius="xl"
              />
            </HiddenLabelField>
            <Switch label="Only batches with stock" checked={inStockOnly} onChange={(event) => setInStockOnly(event.currentTarget.checked)} mb={8} />
          </>
        }
        activeFilterCount={activeFilters}
        onResetFilters={clearFilters}
      >
        <DataTable
          label="Batches"
          columns={columns}
          rows={list.data?.items}
          getRowKey={(batch) => batch.id}
          getRowStyle={(batch) => ROW_STYLES[batch.healthStatus]}
          loading={list.isLoading}
          refreshing={list.isLoading && Boolean(list.data)}
          error={list.error}
          onRetry={() => void list.mutate()}
          permission={PERMISSIONS.BATCHES_MANAGE}
          minWidth={980}
          emptyIcon={<IconCalendarTime stroke={1.6} />}
          emptyTitle={filtered ? "No batches match these filters" : "No batches yet"}
          emptyDescription={
            filtered ? "Try another status or clear the filters." : "Import a batch to add stock. Products go live automatically once they have stock."
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
                  itemLabel: "batches",
                }
              : undefined
          }
        />
      </ListCard>

      <ImportBatchModal opened={importOpen} onClose={closeImport} initialProduct={importParam ? toOption(importProduct) : null} />
      {canAdjust ? <AdjustStockModal batch={adjusting} onClose={() => setAdjusting(null)} /> : null}
    </Stack>
  );
}
