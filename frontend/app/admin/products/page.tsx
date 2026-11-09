"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconDiscount,
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconPackage,
  IconPackageImport,
  IconPencil,
  IconPlus,
  IconRestore,
  IconSearch,
} from "@tabler/icons-react";
import { ImageWithFallback } from "../../../components/ImageWithFallback";
import { Price } from "../../../components/Price";
import { StatusBadge } from "../../../components/StatusBadge";
import { ConfirmModal } from "../../../components/admin/ConfirmModal";
import { DataTable, type DataTableColumn } from "../../../components/admin/DataTable";
import { FilterBar } from "../../../components/admin/FilterBar";
import { ListingStatusBadge } from "../../../components/admin/ListingStatusBadge";
import { PageHeader } from "../../../components/admin/PageHeader";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import { formatCalendarDate, formatCount, formatDhakaDate, formatMoney } from "../../../components/admin/format";
import { ProductDetailDrawer } from "../../../components/admin/products/ProductDetailDrawer";
import { ProductFormModal } from "../../../components/admin/products/ProductFormModal";
import { useAdminProducts, useCategories, useProductMutations } from "../../../hooks/admin/use-admin-products";
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

const STATUS_OPTIONS: { value: AdminProductStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Live" },
  { value: "awaiting_stock", label: "Awaiting stock" },
  { value: "inactive", label: "Inactive" },
];

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

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

export default function AdminProductsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.PRODUCTS_READ}>
      <ProductsView />
    </RequirePermission>
  );
}

function ProductsView() {
  const searchParams = useSearchParams();
  const canWrite = useCan(PERMISSIONS.PRODUCTS_WRITE);
  const canBatches = useCan(PERMISSIONS.BATCHES_MANAGE);
  const canDiscounts = useCan(PERMISSIONS.DISCOUNTS_MANAGE);

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [brand, setBrand] = useState("");
  const [debouncedBrand] = useDebouncedValue(brand, 300);
  const [status, setStatus] = useState<AdminProductStatusFilter>(() =>
    pick(searchParams.get("status"), ADMIN_PRODUCT_STATUS_FILTERS, "all"),
  );
  const [stock, setStock] = useState<AdminStockFilter>(() => pick(searchParams.get("stock"), ADMIN_STOCK_FILTERS, "all"));
  const [category, setCategory] = useState<string | null>(() => searchParams.get("category"));
  const [sort, setSort] = useState<AdminProductSort>("newest");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminProductDTO | null>(null);
  const [formOpened, setFormOpened] = useState(false);
  const [deactivating, setDeactivating] = useState<AdminProductDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useAdminProducts({
    page,
    limit,
    q: debouncedSearch,
    brand: debouncedBrand,
    status,
    stock,
    category,
    sort,
  });
  const { data: categories } = useCategories();
  const { deactivateProduct, reactivateProduct } = useProductMutations();

  const categoryOptions = useMemo(
    () => (categories ?? []).map((item) => ({ value: item.id, label: item.name })),
    [categories],
  );

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const activeFilters =
    (search.trim() ? 1 : 0) + (brand.trim() ? 1 : 0) + (stock !== "all" ? 1 : 0) + (category ? 1 : 0) + (status !== "all" ? 1 : 0);

  const clearFilters = () => {
    setSearch("");
    setBrand("");
    setStock("all");
    setCategory(null);
    setStatus("all");
    setPage(1);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpened(true);
  };

  const openEdit = (product: AdminProductDTO) => {
    setEditing(product);
    setFormOpened(true);
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

  const columns: DataTableColumn<AdminProductDTO>[] = [
    {
      key: "product",
      header: "Product",
      skeletonWidth: "85%",
      cell: (product) => (
        <Group gap="sm" wrap="nowrap">
          <Box
            w={44}
            h={44}
            style={{ position: "relative", flexShrink: 0, borderRadius: "var(--mo-radius-sm)", overflow: "hidden", border: "1px solid var(--mo-color-border-subtle)" }}
          >
            <ImageWithFallback src={product.images[0]} alt="" fill sizes="44px" style={{ objectFit: "cover" }} />
          </Box>
          <Box style={{ minWidth: 0 }}>
            <Anchor component="button" type="button" fw={600} size="sm" ta="left" lineClamp={2} onClick={() => setDetailId(product.id)}>
              {product.title}
            </Anchor>
            <Text size="xs" c="dimmed" truncate>
              <Text component="span" inherit ff="var(--mo-font-monospace)">
                {product.sku}
              </Text>{" "}
              · {product.category.name}
              {product.brand ? ` · ${product.brand}` : ""}
            </Text>
          </Box>
        </Group>
      ),
    },
    {
      key: "status",
      header: "Listing",
      width: 160,
      cell: (product) => (
        <Stack gap={4} align="flex-start">
          <ListingStatusBadge status={product.listingStatus} />
          {product.activeDiscount ? (
            <Badge size="xs" variant="light" color={product.activeDiscount.isFlashSale ? "accentPurple" : "primaryPink"}>
              {product.activeDiscount.isFlashSale ? "Flash sale" : "Discount"} −{product.discountPercent}%
            </Badge>
          ) : null}
        </Stack>
      ),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      width: 130,
      cell: (product) => <Price value={product.effectivePrice} compareAt={product.basePrice} size="sm" />,
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      width: 110,
      visibleFrom: "lg",
      cell: (product) => (
        <Text size="sm" c="dimmed" className="mo-tabular-nums">
          {formatMoney(product.costPrice)}
        </Text>
      ),
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      width: 140,
      cell: (product) => (
        <Stack gap={2} align="flex-end">
          <Group gap={6} wrap="nowrap" justify="flex-end">
            {product.isOutOfStock ? <StatusBadge status="OUT_OF_STOCK" size="xs" withIcon={false} /> : null}
            {!product.isOutOfStock && product.isLowStock ? <StatusBadge status="LOW_STOCK" size="xs" withIcon={false} /> : null}
            <Text size="sm" fw={600} className="mo-tabular-nums">
              {formatCount(product.totalStock)}
            </Text>
          </Group>
          {product.requiresBatchTracking && product.earliestExpiry ? (
            <Text size="xs" c="dimmed">
              Exp. {formatCalendarDate(product.earliestExpiry)}
            </Text>
          ) : null}
        </Stack>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      width: 130,
      visibleFrom: "xl",
      cell: (product) => (
        <Text size="sm" c="dimmed">
          {formatDhakaDate(product.updatedAt)}
        </Text>
      ),
    },
    {
      key: "actions",
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: "right",
      width: 60,
      skeletonWidth: 24,
      cell: (product) => (
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${product.title}`}>
              <IconDotsVertical size={18} aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconEye size={16} aria-hidden />} onClick={() => setDetailId(product.id)}>
              View details & batches
            </Menu.Item>
            {canWrite ? (
              <Menu.Item leftSection={<IconPencil size={16} aria-hidden />} onClick={() => openEdit(product)}>
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
      ),
    },
  ];

  const meta = list.data?.meta;

  return (
    <Stack gap={0}>
      <PageHeader
        title="Products"
        description={
          canWrite
            ? "Catalog, prices and listing status. New products stay hidden (Awaiting stock) until their first batch is imported."
            : "Catalog, prices and listing status. You have read-only access."
        }
        actions={
          <>
            {canDiscounts ? (
              <Button component={Link} href="/admin/discounts" variant="default" leftSection={<IconDiscount size={16} aria-hidden />}>
                Discounts
              </Button>
            ) : null}
            {canWrite ? (
              <Button leftSection={<IconPlus size={16} aria-hidden />} onClick={openCreate}>
                New product
              </Button>
            ) : null}
          </>
        }
      />

      <SegmentedControl
        mb="md"
        value={status}
        onChange={(value) => resetPage(setStatus)(pick(value, ADMIN_PRODUCT_STATUS_FILTERS, "all"))}
        data={STATUS_OPTIONS}
        aria-label="Listing status"
        style={{ alignSelf: "flex-start", maxWidth: "100%" }}
      />

      <FilterBar activeCount={activeFilters} onReset={clearFilters}>
        <TextInput
          variant="search"
          label="Search"
          placeholder="Title, SKU or brand"
          leftSection={<IconSearch size={16} aria-hidden />}
          value={search}
          onChange={(event) => resetPage(setSearch)(event.currentTarget.value)}
          w={{ base: "100%", sm: 260 }}
        />
        <Select
          label="Category"
          placeholder="All categories"
          data={categoryOptions}
          value={category}
          onChange={resetPage(setCategory)}
          searchable
          clearable
          nothingFoundMessage="No matching category"
          w={{ base: "100%", sm: 220 }}
          radius="xl"
        />
        <TextInput
          label="Brand"
          placeholder="Any brand"
          value={brand}
          onChange={(event) => resetPage(setBrand)(event.currentTarget.value)}
          w={{ base: "100%", sm: 160 }}
          radius="xl"
        />
        <Select
          label="Stock"
          data={STOCK_OPTIONS}
          value={stock}
          onChange={(value) => resetPage(setStock)(pick(value, ADMIN_STOCK_FILTERS, "all"))}
          allowDeselect={false}
          w={{ base: "100%", sm: 150 }}
          radius="xl"
        />
        <Select
          label="Sort"
          data={SORT_OPTIONS}
          value={sort}
          onChange={(value) => resetPage(setSort)(pick(value, ADMIN_PRODUCT_SORTS, "newest"))}
          allowDeselect={false}
          w={{ base: "100%", sm: 190 }}
          radius="xl"
        />
      </FilterBar>

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
        minWidth={900}
        emptyIcon={<IconPackage stroke={1.6} />}
        emptyTitle={activeFilters > 0 ? "No products match these filters" : "No products yet"}
        emptyDescription={activeFilters > 0 ? "Try a different search or clear the filters." : canWrite ? "Create your first product to start selling." : undefined}
        emptyAction={
          activeFilters > 0 ? (
            <Button variant="light" onClick={clearFilters}>
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
                onPageChange: setPage,
                onLimitChange: resetPage(setLimit),
                itemLabel: "products",
              }
            : undefined
        }
      />

      <ProductDetailDrawer productId={detailId} onClose={() => setDetailId(null)} onEdit={openEdit} />

      {canWrite ? (
        <ProductFormModal
          opened={formOpened}
          product={editing}
          onClose={() => setFormOpened(false)}
          onSaved={(saved) => {
            if (!editing) {
              setDetailId(saved.id);
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
            <Text size="sm" c="dimmed">
              It is not deleted: past orders, batches and stock history stay intact, and you can reactivate it at any time.
            </Text>
          </Stack>
        }
      />
    </Stack>
  );
}
