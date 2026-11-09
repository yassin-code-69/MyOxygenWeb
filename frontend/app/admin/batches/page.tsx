"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconAdjustments,
  IconCalendarTime,
  IconDotsVertical,
  IconFileSpreadsheet,
  IconPackageImport,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { StatusBadge } from "../../../components/StatusBadge";
import { AdjustStockModal } from "../../../components/admin/batches/AdjustStockModal";
import { ImportBatchModal } from "../../../components/admin/batches/ImportBatchModal";
import { DataTable, type DataTableColumn, type DataTableRowStyle } from "../../../components/admin/DataTable";
import { FilterBar } from "../../../components/admin/FilterBar";
import { MeterBar } from "../../../components/admin/MeterBar";
import { PageHeader } from "../../../components/admin/PageHeader";
import { ProductPicker, type ProductOption } from "../../../components/admin/ProductPicker";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import { formatCalendarDate, formatCount } from "../../../components/admin/format";
import { useAdminProduct } from "../../../hooks/admin/use-admin-products";
import { useBatches } from "../../../hooks/admin/use-batches";
import { useCan } from "../../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../../types/auth";
import { BATCH_HEALTH_STATUSES, type AdminBatchDTO, type BatchHealthStatus } from "../../../types/admin";

type StatusFilter = BatchHealthStatus | "ALL";

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

const STATUS_COLORS: Record<StatusFilter, string> = {
  ALL: "gray",
  EXPIRED: "danger",
  EXPIRING_SOON: "warning",
  HEALTHY: "success",
};

function parseStatus(value: string | null): StatusFilter {
  return BATCH_HEALTH_STATUSES.find((status) => status === value) ?? "ALL";
}

function expiryText(batch: AdminBatchDTO): string {
  const days = batch.daysUntilExpiry;
  if (days > 1) {
    return `in ${formatCount(days)} days`;
  }
  if (days === 1) {
    return "tomorrow";
  }
  if (days === 0) {
    return "today";
  }
  return `${formatCount(Math.abs(days))} ${Math.abs(days) === 1 ? "day" : "days"} ago`;
}

export default function AdminBatchesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.BATCHES_MANAGE}>
      <BatchesView />
    </RequirePermission>
  );
}

function BatchesView() {
  const searchParams = useSearchParams();
  const canAdjust = useCan(PERMISSIONS.STOCK_ADJUST);
  const importProductId = searchParams.get("import");

  const [status, setStatus] = useState<StatusFilter>(() => parseStatus(searchParams.get("status")));
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [productId, setProductId] = useState<string | null>(() => searchParams.get("productId"));
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [importOpened, setImportOpened] = useState(() => Boolean(importProductId));
  const [adjusting, setAdjusting] = useState<AdminBatchDTO | null>(null);

  // Labels for products preselected through the URL (?import= / ?productId=).
  const { data: importProduct } = useAdminProduct(importProductId);
  const { data: filterProduct } = useAdminProduct(searchParams.get("productId"));
  const importInitial: ProductOption | null = importProduct
    ? { id: importProduct.id, title: importProduct.title, sku: importProduct.sku, listingStatus: importProduct.listingStatus }
    : null;
  const filterInitial: ProductOption | null = filterProduct
    ? { id: filterProduct.id, title: filterProduct.title, sku: filterProduct.sku, listingStatus: filterProduct.listingStatus }
    : null;

  const list = useBatches({
    page,
    limit,
    status: status === "ALL" ? null : status,
    q: debouncedSearch,
    productId,
    inStockOnly,
  });
  const summary = list.data?.meta.summary;
  const summaryTotal = summary ? summary.EXPIRED + summary.EXPIRING_SOON + summary.HEALTHY : null;

  const activeFilters = (search.trim() ? 1 : 0) + (productId ? 1 : 0) + (inStockOnly ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    setProductId(null);
    setInStockOnly(false);
    setPage(1);
  };

  const countFor = (key: StatusFilter): number | null => {
    if (!summary) {
      return null;
    }
    return key === "ALL" ? summaryTotal : summary[key];
  };

  const columns: DataTableColumn<AdminBatchDTO>[] = [
    {
      key: "product",
      header: "Product",
      skeletonWidth: "80%",
      cell: (batch) => (
        <Box style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} lineClamp={1}>
            {batch.productTitle}
          </Text>
          <Text size="xs" c="dimmed" ff="var(--mo-font-monospace)">
            {batch.sku}
          </Text>
        </Box>
      ),
    },
    {
      key: "batch",
      header: "Batch",
      width: 180,
      cell: (batch) => (
        <Text size="sm" fw={600} ff="var(--mo-font-monospace)">
          {batch.batchNumber}
        </Text>
      ),
    },
    {
      key: "manufactured",
      header: "Made",
      width: 120,
      visibleFrom: "lg",
      cell: (batch) => (
        <Text size="sm" c="dimmed">
          {batch.manufactureDate ? formatCalendarDate(batch.manufactureDate) : "—"}
        </Text>
      ),
    },
    {
      key: "expiry",
      header: "Expiry",
      width: 150,
      cell: (batch) => (
        <Box>
          <Text size="sm" fw={batch.healthStatus === "HEALTHY" ? 400 : 600}>
            {formatCalendarDate(batch.expiryDate)}
          </Text>
          <Text size="xs" c={batch.healthStatus === "EXPIRED" ? "var(--mo-color-text-danger)" : "dimmed"}>
            {expiryText(batch)}
          </Text>
        </Box>
      ),
    },
    {
      key: "quantity",
      header: "Available",
      align: "right",
      width: 150,
      cell: (batch) => (
        <Stack gap={4} align="stretch">
          <Text size="sm" ta="right" className="mo-tabular-nums">
            <strong>{formatCount(batch.availableQuantity)}</strong>
            <Text component="span" size="xs" c="dimmed">
              {" "}
              / {formatCount(batch.initialQuantity)}
            </Text>
          </Text>
          <MeterBar
            ratio={batch.initialQuantity > 0 ? batch.availableQuantity / batch.initialQuantity : 0}
            color={batch.healthStatus === "HEALTHY" ? "secondaryGreen" : batch.healthStatus === "EXPIRED" ? "danger" : "warning"}
            height={4}
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
      width: 60,
      skeletonWidth: 24,
      cell: (batch) =>
        canAdjust ? (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label={`Actions for batch ${batch.batchNumber}`}>
                <IconDotsVertical size={18} aria-hidden />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconAdjustments size={16} aria-hidden />} onClick={() => setAdjusting(batch)}>
                Adjust stock
              </Menu.Item>
              {batch.healthStatus === "EXPIRED" && batch.availableQuantity > 0 ? (
                <Menu.Item color="danger" leftSection={<IconTrash size={16} aria-hidden />} onClick={() => setAdjusting(batch)}>
                  Write off expired stock
                </Menu.Item>
              ) : null}
              <Menu.Item
                component={Link}
                href={`/admin/ledger?productId=${batch.productId}`}
                leftSection={<IconFileSpreadsheet size={16} aria-hidden />}
              >
                Stock history
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ) : null,
    },
  ];

  const meta = list.data?.meta;

  return (
    <Stack gap={0}>
      <PageHeader
        title="Batches"
        description="Batch inspector: every batch in expiry order (first-expired, first-out). Expiring soon = 30 days or less with stock left. Days count in Dhaka time."
        actions={
          <Button color="secondaryGreen" leftSection={<IconPackageImport size={16} aria-hidden />} onClick={() => setImportOpened(true)}>
            Import batch
          </Button>
        }
      />

      <SegmentedControl
        mb="md"
        value={status}
        onChange={(value) => {
          setStatus(value === "ALL" ? "ALL" : parseStatus(value));
          setPage(1);
        }}
        aria-label="Batch health"
        style={{ alignSelf: "flex-start", maxWidth: "100%" }}
        data={(["ALL", ...BATCH_HEALTH_STATUSES] as StatusFilter[]).map((key) => {
          const count = countFor(key);
          return {
            value: key,
            label: (
              <Group gap={6} wrap="nowrap" justify="center">
                <span>{STATUS_LABELS[key]}</span>
                {count !== null ? (
                  <Badge size="xs" variant="light" color={STATUS_COLORS[key]} className="mo-tabular-nums">
                    {formatCount(count)}
                  </Badge>
                ) : null}
              </Group>
            ),
          };
        })}
      />

      <FilterBar activeCount={activeFilters} onReset={clearFilters}>
        <TextInput
          variant="search"
          label="Search"
          placeholder="Batch number, product or SKU"
          leftSection={<IconSearch size={16} aria-hidden />}
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          w={{ base: "100%", sm: 280 }}
        />
        <ProductPicker
          label="Product"
          placeholder="All products"
          clearable
          value={productId}
          initialProduct={filterInitial}
          onChange={(id) => {
            setProductId(id);
            setPage(1);
          }}
          w={{ base: "100%", sm: 280 }}
          radius="xl"
        />
        <Switch
          label="Only batches with stock"
          checked={inStockOnly}
          onChange={(event) => {
            setInStockOnly(event.currentTarget.checked);
            setPage(1);
          }}
          mb={8}
        />
      </FilterBar>

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
        minWidth={880}
        emptyIcon={<IconCalendarTime stroke={1.6} />}
        emptyTitle={status !== "ALL" || activeFilters > 0 ? "No batches match these filters" : "No batches yet"}
        emptyDescription={
          status !== "ALL" || activeFilters > 0
            ? "Try another status or clear the filters."
            : "Import a batch to add stock. Products go live automatically once they have stock."
        }
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
                itemLabel: "batches",
              }
            : undefined
        }
      />

      <ImportBatchModal opened={importOpened} onClose={() => setImportOpened(false)} initialProduct={importInitial} />
      {canAdjust ? <AdjustStockModal batch={adjusting} onClose={() => setAdjusting(null)} /> : null}
    </Stack>
  );
}
