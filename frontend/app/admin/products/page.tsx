"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconBolt,
  IconCircleCheck,
  IconDiscount,
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconHourglass,
  IconPackage,
  IconPackageImport,
  IconPackages,
  IconPencil,
  IconPlus,
  IconRestore,
  IconSearch,
  IconTable,
} from "@tabler/icons-react";
import { StatusBadge } from "../../../components/StatusBadge";
import { ConfirmModal } from "../../../components/admin/ConfirmModal";
import { DataTable, type DataTableColumn } from "../../../components/admin/DataTable";
import { ListingStatusBadge } from "../../../components/admin/ListingStatusBadge";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import { formatCalendarDate, formatCount, formatDhakaDate, formatMoney, pluralize } from "../../../components/admin/format";
import { KpiCard, PageHeader, Thumb } from "../../../components/admin/kit";
import { CountTabs, type CountTab } from "../../../components/admin/products/CountTabs";
import { ListCard } from "../../../components/admin/products/ListCard";
import { MarginBadge } from "../../../components/admin/products/pricing";
import { ProductDetailDrawer } from "../../../components/admin/products/ProductDetailDrawer";
import { ProductFormModal } from "../../../components/admin/products/ProductFormModal";
import {
  useAdminProducts,
  useCategories,
  useProductBrandOptions,
  useProductKpis,
  useProductMutations,
  useProductStatusCounts,
} from "../../../hooks/admin/use-admin-products";
import { pickParam, usePaging, useUrlParams } from "../../../hooks/admin/use-ops-url-state";
import { useCan } from "../../../hooks/admin/use-permission";
import { getErrorMessage } from "../../../lib/api-client";
import { PERMISSIONS } from "../../../types/auth";
import {
  ADMIN_PRODUCT_SORTS,
  ADMIN_PRODUCT_STATUS_FILTERS,
  ADMIN_STOCK_FILTERS,
  type AdminProductDTO,
  type AdminProductSort,
  type AdminProductStatusFilter,
  type AdminStockFilter,
} from "../../../types/admin";

const STATUS_LABELS: Record<AdminProductStatusFilter, string> = {
  all: "All",
  active: "Live",
  awaiting_stock: "Awaiting stock",
  inactive: "Inactive",
};

const STATUS_ORDER: readonly AdminProductStatusFilter[] = ["all", "active", "awaiting_stock", "inactive"];

const STOCK_OPTIONS: { value: AdminStockFilter; label: string }[] = [
  { value: "all", label: "Any stock" },
  { value: "in_stock", label: "In stock" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
];

const SORT_OPTIONS: { value: AdminProductSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title_asc", label: "Title A–Z" },
  { value: "title_desc", label: "Title Z–A" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "stock_asc", label: "Stock: low to high" },
  { value: "stock_desc", label: "Stock: high to low" },
];

const CATEGORY_COLORS = ["secondaryGreen", "accentPurple", "info", "warning", "primaryPink"] as const;

function categoryColor(id: string): (typeof CATEGORY_COLORS)[number] {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length] ?? "secondaryGreen";
}

export default function AdminProductsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.PRODUCTS_READ}>
      <ProductsView />
    </RequirePermission>
  );
}

function ProductsView() {
  const { searchParams, setParams } = useUrlParams();
  const canWrite = useCan(PERMISSIONS.PRODUCTS_WRITE);
  const canBatches = useCan(PERMISSIONS.BATCHES_MANAGE);
  const canDiscounts = useCan(PERMISSIONS.DISCOUNTS_MANAGE);

  // Deep links (and every filter that can arrive through one) live in the URL.
  const status = pickParam(searchParams.get("status"), ADMIN_PRODUCT_STATUS_FILTERS, "all");
  const stock = pickParam(searchParams.get("stock"), ADMIN_STOCK_FILTERS, "all");
  const category = searchParams.get("category");
  const brand = searchParams.get("brand");
  const detailId = searchParams.get("productId");
  const createOpen = canWrite && searchParams.get("new") === "1";
  const urlQuery = searchParams.get("q") ?? "";

  const [searchDraft, setSearchDraft] = useState({ source: urlQuery, text: urlQuery });
  const search = searchDraft.source === urlQuery ? searchDraft.text : urlQuery;
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [sort, setSort] = useState<AdminProductSort>("newest");
  const [editing, setEditing] = useState<AdminProductDTO | null>(null);
  const [deactivating, setDeactivating] = useState<AdminProductDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const filters = { q: debouncedSearch, category, brand: brand ?? undefined, stock };
  const paging = usePaging(JSON.stringify({ ...filters, status, sort }));
  const list = useAdminProducts({ page: paging.page, limit: paging.limit, status, sort, ...filters });
  const statusCounts = useProductStatusCounts(filters);
  const kpis = useProductKpis();
  const { data: categories } = useCategories();
  const { data: brands } = useProductBrandOptions();
  const { deactivateProduct, reactivateProduct } = useProductMutations();

  const categoryOptions = useMemo(() => {
    const options = (categories ?? []).map((item) => ({ value: item.slug, label: item.name }));
    if (category && !options.some((option) => option.value === category)) {
      const byId = categories?.find((item) => item.id === category);
      options.unshift({ value: category, label: byId?.name ?? category });
    }
    return options;
  }, [categories, category]);

  const brandOptions = useMemo(() => {
    const options = (brands ?? []).map((item) => ({ value: item.name, label: `${item.name} (${formatCount(item.productCount)})` }));
    if (brand && !options.some((option) => option.value.toLowerCase() === brand.toLowerCase())) {
      options.unshift({ value: brand, label: brand });
    }
    return options;
  }, [brands, brand]);
  const brandValue = brandOptions.find((option) => option.value.toLowerCase() === brand?.toLowerCase())?.value ?? null;

  const activeFilters = (search.trim() ? 1 : 0) + (brand ? 1 : 0) + (stock !== "all" ? 1 : 0) + (category ? 1 : 0);
  const filtered = activeFilters > 0 || status !== "all";

  const clearFilters = () => {
    setSearchDraft({ source: urlQuery, text: "" });
    setParams({ q: null, brand: null, stock: null, category: null });
  };

  const openCreate = () => {
    setEditing(null);
    setParams({ new: "1" });
  };
  const openDetail = (productId: string) => setParams({ productId });
  const closeForm = () => {
    setEditing(null);
    if (searchParams.get("new") !== null) {
      setParams({ new: null });
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivating) {
      return;
    }
    setBusy(true);
    try {
      const product = await deactivateProduct(deactivating.id, { mutate: list.mutate, current: list.data });
      notifications.show({
        color: "success",
        title: "Product deactivated",
        message: `${product.title} is hidden from the storefront. Its orders and stock history are kept.`,
      });
      setDeactivating(null);
    } catch (error) {
      notifications.show({ color: "danger", title: "Couldn't deactivate", message: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async (product: AdminProductDTO) => {
    try {
      const updated = await reactivateProduct(product.id);
      notifications.show({
        color: "success",
        title: "Product reactivated",
        message:
          updated.listingStatus === "ACTIVE"
            ? `${updated.title} is live on the storefront again.`
            : `${updated.title} will go live as soon as it has sellable stock.`,
      });
    } catch (error) {
      notifications.show({ color: "danger", title: "Couldn't reactivate", message: getErrorMessage(error) });
    }
  };

  const counts = statusCounts.data;
  const tabs: CountTab<AdminProductStatusFilter>[] = STATUS_ORDER.map((value) => ({
    value,
    label: STATUS_LABELS[value],
    count: counts ? counts[value] : null,
  }));

  const columns: DataTableColumn<AdminProductDTO>[] = [
    {
      key: "product",
      header: "Product",
      width: 300,
      skeletonWidth: "85%",
      cell: (product) => (
        <Group gap="sm" wrap="nowrap" miw={240}>
          <Thumb src={product.images[0]} size={44} />
          <Box style={{ minWidth: 0 }}>
            <UnstyledButton onClick={() => openDetail(product.id)} aria-label={`Open ${product.title}`}>
              <Text size="sm" fw={600} lineClamp={2} c="var(--mo-color-text)">
                {product.title}
              </Text>
            </UnstyledButton>
            <Text size="xs" c="var(--mo-color-text-muted)" truncate>
              <Text component="span" inherit ff="var(--mo-font-monospace)">
                {product.sku}
              </Text>
              {product.brand ? ` · ${product.brand}` : ""}
            </Text>
          </Box>
        </Group>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: 170,
      cell: (product) => (
        <Badge variant="light" color={categoryColor(product.category.id)} radius="xl" tt="none" fw={600} style={{ maxWidth: "none" }}>
          {product.category.name}
        </Badge>
      ),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      width: 150,
      cell: (product) => (
        <Stack gap={2} align="flex-end">
          <Text size="sm" fw={700} className="mo-tabular-nums" c="var(--mo-color-text)" style={{ whiteSpace: "nowrap" }}>
            {formatMoney(product.effectivePrice)}
          </Text>
          {product.effectivePrice < product.basePrice ? (
            <Group gap={4} wrap="nowrap">
              <Text size="xs" c="var(--mo-color-text-muted)" td="line-through" className="mo-tabular-nums">
                {formatMoney(product.basePrice)}
              </Text>
              <Badge
                size="xs"
                variant="light"
                radius="xl"
                color={product.activeDiscount?.isFlashSale ? "accentPurple" : "primaryPink"}
                leftSection={product.activeDiscount?.isFlashSale ? <IconBolt size={10} aria-hidden /> : undefined}
                className="mo-tabular-nums"
                style={{ maxWidth: "none", overflow: "visible" }}
              >
                −{Math.round(product.discountPercent)}%
              </Badge>
            </Group>
          ) : null}
        </Stack>
      ),
    },
    {
      key: "margin",
      header: "Cost · margin",
      align: "right",
      width: 130,
      cell: (product) => (
        <Stack gap={4} align="flex-end">
          <Text size="xs" c="var(--mo-color-text-secondary)" className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
            {formatMoney(product.costPrice)}
          </Text>
          <MarginBadge price={product.effectivePrice} cost={product.costPrice} size="sm" />
        </Stack>
      ),
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      width: 140,
      cell: (product) => (
        <Stack gap={4} align="flex-end">
          <Group gap={6} wrap="nowrap" justify="flex-end">
            {product.isOutOfStock ? <StatusBadge status="OUT_OF_STOCK" size="xs" withIcon={false} /> : null}
            {!product.isOutOfStock && product.isLowStock ? <StatusBadge status="LOW_STOCK" size="xs" withIcon={false} /> : null}
            <Text size="sm" fw={700} className="mo-tabular-nums" c="var(--mo-color-text)">
              {formatCount(product.totalStock)}
            </Text>
          </Group>
          {product.requiresBatchTracking && product.earliestExpiry ? (
            <Text size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap" }}>
              Exp. {formatCalendarDate(product.earliestExpiry)}
            </Text>
          ) : null}
        </Stack>
      ),
    },
    {
      key: "status",
      header: "Listing",
      width: 140,
      cell: (product) => <ListingStatusBadge status={product.listingStatus} />,
    },
    {
      key: "updated",
      header: "Updated",
      width: 120,
      visibleFrom: "xl",
      cell: (product) => (
        <Text size="xs" c="var(--mo-color-text-secondary)" style={{ whiteSpace: "nowrap" }}>
          {formatDhakaDate(product.updatedAt)}
        </Text>
      ),
    },
    {
      key: "actions",
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: "right",
      width: 110,
      skeletonWidth: 70,
      cell: (product) => (
        <Group gap={6} justify="flex-end" wrap="nowrap">
          <Button size="compact-sm" radius="xl" variant="light" color="info" onClick={() => openDetail(product.id)} aria-label={`View ${product.title}`}>
            View
          </Button>
          <Menu position="bottom-end" withinPortal width={250}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" radius="xl" aria-label={`Actions for ${product.title}`}>
                <IconDotsVertical size={18} aria-hidden />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEye size={16} aria-hidden />} onClick={() => openDetail(product.id)}>
                View details & batches
              </Menu.Item>
              {canWrite ? (
                <Menu.Item leftSection={<IconPencil size={16} aria-hidden />} onClick={() => setEditing(product)}>
                  Edit
                </Menu.Item>
              ) : null}
              {canBatches ? (
                <Menu.Item component={Link} href={`/admin/batches?import=${product.id}`} leftSection={<IconPackageImport size={16} aria-hidden />}>
                  Import batch
                </Menu.Item>
              ) : null}
              {canDiscounts ? (
                <Menu.Item
                  component={Link}
                  href={`/admin/discounts?new=automatic&productId=${product.id}`}
                  leftSection={<IconDiscount size={16} aria-hidden />}
                >
                  Create discount / flash sale
                </Menu.Item>
              ) : null}
              {canWrite ? <Menu.Divider /> : null}
              {canWrite && product.listingStatus !== "INACTIVE" ? (
                <Menu.Item color="danger" leftSection={<IconEyeOff size={16} aria-hidden />} onClick={() => setDeactivating(product)}>
                  Deactivate (hide)
                </Menu.Item>
              ) : null}
              {canWrite && product.listingStatus === "INACTIVE" ? (
                <Menu.Item leftSection={<IconRestore size={16} aria-hidden />} onClick={() => void handleReactivate(product)}>
                  Reactivate
                </Menu.Item>
              ) : null}
            </Menu.Dropdown>
          </Menu>
        </Group>
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
        icon={<IconPackage size={20} />}
        title="Products"
        subtitle={
          canWrite
            ? "Catalog, prices, landed cost and listing status. New products stay hidden (Awaiting stock) until their first batch is imported."
            : "Catalog, prices and listing status. You have read-only access."
        }
        actions={
          <>
            {canDiscounts ? (
              <Button component={Link} href="/admin/discounts" variant="default" radius="xl" leftSection={<IconDiscount size={16} aria-hidden />}>
                Discounts
              </Button>
            ) : null}
            {canWrite ? (
              <Button radius="xl" color="secondaryGreen.8" leftSection={<IconPlus size={16} aria-hidden />} onClick={openCreate}>
                New product
              </Button>
            ) : null}
          </>
        }
      />

      {kpis.error && !kpiData ? null : (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 5 }} spacing="md">
          <KpiCard
            tone="sky"
            icon={<IconPackages size={24} stroke={1.8} />}
            label="Total products"
            value={kpiData ? formatCount(kpiData.total) : undefined}
            hint="Every listing status"
            loading={kpiLoading}
          />
          <KpiCard
            tone="mint"
            icon={<IconCircleCheck size={24} stroke={1.8} />}
            label="Live"
            value={kpiData ? formatCount(kpiData.live) : undefined}
            href="/admin/products?status=active"
            linkLabel="View"
            hint="On the storefront"
            loading={kpiLoading}
          />
          <KpiCard
            tone="lavender"
            icon={<IconHourglass size={24} stroke={1.8} />}
            label="Awaiting stock"
            value={kpiData ? formatCount(kpiData.awaitingStock) : undefined}
            href="/admin/products?status=awaiting_stock"
            linkLabel="View"
            hint="Live with next batch"
            loading={kpiLoading}
          />
          <KpiCard
            tone="peach"
            icon={<IconEyeOff size={24} stroke={1.8} />}
            label="Inactive"
            value={kpiData ? formatCount(kpiData.inactive) : undefined}
            href="/admin/products?status=inactive"
            linkLabel="View"
            hint="Hidden by an admin"
            loading={kpiLoading}
          />
          <KpiCard
            tone="rose"
            icon={<IconAlertTriangle size={24} stroke={1.8} />}
            label="Low stock"
            value={kpiData ? formatCount(kpiData.lowStock) : undefined}
            href="/admin/products?stock=low"
            linkLabel="View"
            hint={kpiData ? `${formatCount(kpiData.outOfStock)} out of stock` : undefined}
            loading={kpiLoading}
          />
        </SimpleGrid>
      )}

      <ListCard
        title="Product catalog"
        icon={<IconTable size={18} color="var(--mo-color-secondary-8)" aria-hidden />}
        subtitle={meta ? pluralize(meta.total, filtered ? "matching product" : "product") : "Loading products…"}
        tabs={
          <CountTabs
            label="Listing status"
            value={status}
            onChange={(next) => setParams({ status: next === "all" ? null : next })}
            tabs={tabs}
          />
        }
        filters={
          <>
            <TextInput
              aria-label="Search products"
              placeholder="Title, SKU or brand"
              leftSection={<IconSearch size={16} aria-hidden />}
              radius="xl"
              value={search}
              onChange={(event) => setSearchDraft({ source: urlQuery, text: event.currentTarget.value })}
              w={{ base: "100%", sm: 260 }}
            />
            <Select
              aria-label="Category"
              placeholder="All categories"
              data={categoryOptions}
              value={category}
              onChange={(value) => setParams({ category: value })}
              searchable
              clearable
              nothingFoundMessage="No matching category"
              w={{ base: "100%", xs: 200 }}
              radius="xl"
            />
            <Select
              aria-label="Brand"
              placeholder="All brands"
              data={brandOptions}
              value={brandValue}
              onChange={(value) => setParams({ brand: value })}
              searchable
              clearable
              nothingFoundMessage="No matching brand"
              w={{ base: "100%", xs: 190 }}
              radius="xl"
            />
            <Select
              aria-label="Stock level"
              data={STOCK_OPTIONS}
              value={stock}
              onChange={(value) => setParams({ stock: value === "all" ? null : value })}
              allowDeselect={false}
              w={{ base: "100%", xs: 150 }}
              radius="xl"
            />
            <Select
              aria-label="Sort"
              data={SORT_OPTIONS}
              value={sort}
              onChange={(value) => setSort(pickParam(value, ADMIN_PRODUCT_SORTS, "newest"))}
              allowDeselect={false}
              w={{ base: "100%", xs: 190 }}
              radius="xl"
            />
          </>
        }
        activeFilterCount={activeFilters}
        onResetFilters={clearFilters}
      >
        <DataTable
          label="Products"
          columns={columns}
          rows={list.data?.items}
          getRowKey={(product) => product.id}
          loading={list.isLoading}
          refreshing={list.isLoading && Boolean(list.data)}
          error={list.error}
          onRetry={() => void list.mutate()}
          permission={PERMISSIONS.PRODUCTS_READ}
          minWidth={1140}
          emptyIcon={<IconPackage stroke={1.6} />}
          emptyTitle={filtered ? "No products match these filters" : "No products yet"}
          emptyDescription={
            filtered ? "Try a different search, another status or clear the filters." : canWrite ? "Create your first product to start selling." : undefined
          }
          emptyAction={
            activeFilters > 0 ? (
              <Button variant="light" radius="xl" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : !filtered && canWrite ? (
              <Button radius="xl" color="secondaryGreen.8" leftSection={<IconPlus size={16} aria-hidden />} onClick={openCreate}>
                New product
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
                  itemLabel: "products",
                }
              : undefined
          }
        />
      </ListCard>

      <ProductDetailDrawer productId={detailId} onClose={() => setParams({ productId: null })} onEdit={setEditing} />

      {canWrite ? (
        <ProductFormModal
          opened={createOpen || editing !== null}
          product={editing}
          onClose={closeForm}
          onSaved={(saved) => {
            if (!editing) {
              // Show the new product (and its "import the first batch" hint) right away.
              setParams({ new: null, productId: saved.id });
            }
          }}
        />
      ) : null}

      <ConfirmModal
        opened={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={() => void confirmDeactivate()}
        loading={busy}
        color="danger"
        title="Deactivate this product?"
        confirmLabel="Deactivate"
        message={
          <Stack gap="xs">
            <Text size="sm">
              <strong>{deactivating?.title}</strong> will be hidden from the storefront and can&apos;t be ordered.
            </Text>
            <Text size="sm" c="var(--mo-color-text-secondary)">
              It is not deleted: past orders, batches and stock history stay intact, and you can reactivate it at any time.
            </Text>
          </Stack>
        }
      />
    </Stack>
  );
}
