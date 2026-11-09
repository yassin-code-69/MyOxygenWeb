"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  CloseButton,
  Grid,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCategory,
  IconCategoryPlus,
  IconCornerDownRight,
  IconDotsVertical,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconFolders,
  IconListDetails,
  IconPackages,
  IconSearch,
} from "@tabler/icons-react";
import { ImageWithFallback } from "../../ImageWithFallback";
import { useAdminCategories, useCategoryMutations } from "../../../hooks/admin/use-admin-categories";
import { useCan } from "../../../hooks/admin/use-permission";
import { getErrorMessage } from "../../../lib/api-client";
import { PERMISSIONS } from "../../../types/auth";
import type { AdminCategory } from "../../../types/admin-management";
import { ConfirmModal } from "../ConfirmModal";
import { DataTable, type DataTableColumn } from "../DataTable";
import { FilterBar } from "../FilterBar";
import { formatCount } from "../format";
import { KpiCard, PageHeader } from "../kit";
import { ActiveBadge } from "../customers/ActiveBadge";
import { MANAGEMENT_GRID_BREAKPOINTS } from "../customers/CustomerKpis";
import { readEnum, useUrlParams } from "../payments/url-state";
import { readListedProductCount } from "./category-errors";
import { toCategoryRows, type CategoryRow } from "./category-tree";
import { CategoryFormModal } from "./CategoryFormModal";

const STATUS_FILTERS = ["all", "active", "inactive"] as const;

function CategoryIcon({ src }: { src: string | null }) {
  return (
    <Box
      w={40}
      h={40}
      style={{
        flex: "0 0 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--mo-radius-sm)",
        border: "1px solid var(--mo-color-border-subtle)",
        backgroundColor: "var(--mo-color-surface-muted)",
        overflow: "hidden",
      }}
      aria-hidden
    >
      <ImageWithFallback src={src} alt="" width={28} height={28} sizes="28px" style={{ objectFit: "contain" }} />
    </Box>
  );
}

/**
 * `/admin/categories` (PRODUCTS_READ; writes PRODUCTS_WRITE). URL state:
 * `?q`, `?status`, `?categoryId` (opens the editor), `?new=1` (opens a blank form).
 */
export function CategoriesView() {
  const { searchParams, setParams } = useUrlParams();
  const canWrite = useCan(PERMISSIONS.PRODUCTS_WRITE);
  const { data, error, isLoading, isValidating, mutate } = useAdminCategories();
  const { updateCategory, deactivateCategory } = useCategoryMutations();

  const q = searchParams.get("q") ?? "";
  const status = readEnum(searchParams.get("status"), STATUS_FILTERS, "all");
  const editId = searchParams.get("categoryId");
  const creating = canWrite && searchParams.get("new") === "1";

  const [search, setSearch] = useState(q);
  const pushSearch = useDebouncedCallback((value: string) => setParams({ q: value.trim() }), 200);
  const [deactivating, setDeactivating] = useState<AdminCategory | null>(null);
  const [deactivateError, setDeactivateError] = useState<{ message: string; listed: number | null } | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const categories = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => {
    if (!data) {
      return undefined;
    }
    const needle = q.trim().toLowerCase();
    return toCategoryRows(data).filter((row) => {
      if (status === "active" && !row.isActive) {
        return false;
      }
      if (status === "inactive" && row.isActive) {
        return false;
      }
      return needle === "" || row.name.toLowerCase().includes(needle) || row.slug.includes(needle);
    });
  }, [data, q, status]);

  const editing = canWrite && editId ? (categories.find((category) => category.id === editId) ?? null) : null;
  const formOpened = creating || editing !== null;

  const totals = useMemo(() => {
    if (!data) {
      return null;
    }
    return {
      active: data.filter((category) => category.isActive).length,
      inactive: data.filter((category) => !category.isActive).length,
      sub: data.filter((category) => category.parentId !== null).length,
      listed: data.reduce((sum, category) => sum + category.activeProductCount, 0),
      products: data.reduce((sum, category) => sum + category.productCount, 0),
    };
  }, [data]);

  const reactivate = async (category: AdminCategory) => {
    setWorking(category.id);
    try {
      await updateCategory(category.id, { isActive: true });
      notifications.show({ color: "success", title: "Category reactivated", message: `“${category.name}” is visible in the store again.` });
    } catch (reactivateError) {
      notifications.show({ color: "danger", title: "Couldn't reactivate the category", message: getErrorMessage(reactivateError) });
    } finally {
      setWorking(null);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivating) {
      return;
    }
    setWorking(deactivating.id);
    setDeactivateError(null);
    try {
      await deactivateCategory(deactivating.id);
      notifications.show({ color: "success", title: "Category deactivated", message: `“${deactivating.name}” is hidden from shoppers.` });
      setDeactivating(null);
    } catch (failure) {
      setDeactivateError({ message: getErrorMessage(failure), listed: readListedProductCount(failure) });
    } finally {
      setWorking(null);
    }
  };

  const columns: DataTableColumn<CategoryRow>[] = [
    {
      key: "category",
      header: "Category",
      skeletonWidth: "80%",
      cell: (row) => (
        <Group gap="sm" wrap="nowrap" pl={row.depth * 22} miw={220}>
          {row.depth > 0 ? (
            <Box c="var(--mo-color-icon-muted)" aria-hidden style={{ display: "flex" }}>
              <IconCornerDownRight size={16} />
            </Box>
          ) : null}
          <CategoryIcon src={row.iconUrl} />
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} c="var(--mo-color-text)" truncate>
              {row.name}
            </Text>
            <Text size="xs" c="var(--mo-color-text-muted)" ff="var(--mo-font-monospace)" truncate>
              /{row.slug}
            </Text>
          </Box>
        </Group>
      ),
    },
    {
      key: "parent",
      header: "Parent",
      skeletonWidth: 90,
      cell: (row) => (
        <Text size="sm" c={row.parentName ? "var(--mo-color-text-strong)" : "var(--mo-color-text-subtle)"} style={{ whiteSpace: "nowrap" }}>
          {row.parentName ?? "Top level"}
        </Text>
      ),
    },
    {
      key: "sort",
      header: "Sort order",
      align: "right",
      width: 100,
      skeletonWidth: 28,
      cell: (row) => (
        <Text size="sm" className="mo-tabular-nums">
          {formatCount(row.sortOrder)}
        </Text>
      ),
    },
    {
      key: "products",
      header: "Products",
      width: 170,
      skeletonWidth: 110,
      cell: (row) => (
        <Box>
          <Text size="sm" fw={600} className="mo-tabular-nums">
            {formatCount(row.activeProductCount)} active
            <Text span size="sm" fw={400} c="var(--mo-color-text-muted)">
              {" "}
              / {formatCount(row.productCount)}
            </Text>
          </Text>
          {row.productCount > 0 ? (
            <Anchor component={Link} href={`/admin/products?category=${encodeURIComponent(row.slug)}`} size="xs" fw={600} c="var(--mo-color-secondary-8)">
              View products
            </Anchor>
          ) : (
            <Text size="xs" c="var(--mo-color-text-subtle)">
              No products yet
            </Text>
          )}
        </Box>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 120,
      skeletonWidth: 64,
      cell: (row) => <ActiveBadge active={row.isActive} />,
    },
  ];

  if (canWrite) {
    columns.push({
      key: "actions",
      header: "Actions",
      align: "right",
      width: 96,
      skeletonWidth: 40,
      cell: (row) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip label="Edit" withArrow>
            <ActionIcon variant="subtle" color="gray" onClick={() => setParams({ categoryId: row.id, new: null })} aria-label={`Edit ${row.name}`}>
              <IconEdit size={18} aria-hidden />
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end" withinPortal shadow="md">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" loading={working === row.id} aria-label={`More actions for ${row.name}`}>
                <IconDotsVertical size={18} aria-hidden />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {row.productCount > 0 ? (
                <Menu.Item component={Link} href={`/admin/products?category=${encodeURIComponent(row.slug)}`} leftSection={<IconListDetails size={16} aria-hidden />}>
                  View products
                </Menu.Item>
              ) : null}
              {row.isActive ? (
                <Menu.Item
                  color="danger"
                  leftSection={<IconEyeOff size={16} aria-hidden />}
                  onClick={() => {
                    setDeactivateError(null);
                    setDeactivating(row);
                  }}
                >
                  Deactivate
                </Menu.Item>
              ) : (
                <Menu.Item leftSection={<IconEye size={16} aria-hidden />} onClick={() => void reactivate(row)}>
                  Reactivate
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      ),
    });
  }

  const activeFilters = (q ? 1 : 0) + (status !== "all" ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    pushSearch.cancel();
    setParams({ q: null, status: null });
  };
  const loading = isLoading && !data;

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconCategory size={20} />}
        title="Categories"
        subtitle="How products are grouped in the store menu. Sub-categories appear under their parent."
        mb={0}
        actions={
          canWrite ? (
            <Button
              color="secondaryGreen.8"
              radius="xl"
              leftSection={<IconCategoryPlus size={18} aria-hidden />}
              onClick={() => setParams({ new: 1, categoryId: null })}
            >
              Add category
            </Button>
          ) : null
        }
      />

      <Grid type="container" breakpoints={MANAGEMENT_GRID_BREAKPOINTS} gap="md">
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard tone="mint" icon={<IconCategory size={24} stroke={1.8} />} label="Active Categories" value={totals ? formatCount(totals.active) : undefined} hint="Visible in the store menu" loading={loading} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard tone="lavender" icon={<IconFolders size={24} stroke={1.8} />} label="Sub-categories" value={totals ? formatCount(totals.sub) : undefined} hint="Nested under another category" loading={loading} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard tone="sky" icon={<IconPackages size={24} stroke={1.8} />} label="Active Products" value={totals ? formatCount(totals.listed) : undefined} hint={totals ? `${formatCount(totals.products)} products in all` : undefined} loading={loading} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard tone="peach" icon={<IconEyeOff size={24} stroke={1.8} />} label="Inactive Categories" value={totals ? formatCount(totals.inactive) : undefined} hint="Hidden from shoppers" loading={loading} />
        </Grid.Col>
      </Grid>

      <div>
        <FilterBar activeCount={activeFilters} onReset={clearFilters}>
          <TextInput
            aria-label="Search categories"
            placeholder="Search name or slug"
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
                    setParams({ q: null });
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
            maw={380}
          />
          <SegmentedControl
            aria-label="Filter by status"
            radius="xl"
            color="secondaryGreen"
            data={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            value={status}
            onChange={(value) => setParams({ status: value === "all" ? null : value })}
          />
        </FilterBar>

        <DataTable
          label="Categories"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          loading={isLoading}
          refreshing={isValidating}
          error={error}
          onRetry={() => void mutate()}
          permission={PERMISSIONS.PRODUCTS_READ}
          skeletonRows={6}
          minWidth={820}
          emptyIcon={<IconCategory stroke={1.6} />}
          emptyTitle={activeFilters > 0 ? "No categories match these filters" : "No categories yet"}
          emptyDescription={activeFilters > 0 ? "Try another name, or show all statuses." : "Create the first category to start organising products."}
          emptyAction={
            activeFilters > 0 ? (
              <Button variant="light" color="secondaryGreen" radius="xl" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : canWrite ? (
              <Button color="secondaryGreen.8" radius="xl" onClick={() => setParams({ new: 1 })}>
                Add category
              </Button>
            ) : undefined
          }
          getRowStyle={(row) => (row.isActive ? undefined : { background: "var(--mo-color-surface-muted)" })}
        />
      </div>

      {canWrite ? (
        <CategoryFormModal
          opened={formOpened}
          category={editing}
          categories={categories}
          onClose={() => setParams({ categoryId: null, new: null })}
        />
      ) : null}

      <ConfirmModal
        opened={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={() => void confirmDeactivate()}
        title="Deactivate this category?"
        message={
          deactivating
            ? `“${deactivating.name}” will be hidden from the store menu. You can reactivate it at any time.`
            : ""
        }
        confirmLabel="Deactivate"
        color="danger"
        loading={deactivating !== null && working === deactivating.id}
        confirmDisabled={(deactivateError?.listed ?? null) !== null}
      >
        {deactivateError && deactivating ? (
          <Box
            role="alert"
            p="sm"
            style={{ borderRadius: "var(--mo-radius-md)", border: "1px solid var(--mo-color-warning-2)", backgroundColor: "var(--mo-color-warning-0)" }}
          >
            {deactivateError.listed !== null ? (
              <Stack gap={6}>
                <Text size="sm" fw={600} c="var(--mo-color-text)">
                  Still in use by {deactivateError.listed === 1 ? "1 listed product" : `${formatCount(deactivateError.listed)} listed products`}
                </Text>
                <Text size="sm" c="var(--mo-color-text-secondary)">
                  Products that are active or waiting for stock keep a category visible. Move them to another category or deactivate them, then try again.
                </Text>
                <Anchor component={Link} href={`/admin/products?category=${encodeURIComponent(deactivating.slug)}`} size="sm" fw={600}>
                  View products in “{deactivating.name}”
                </Anchor>
              </Stack>
            ) : (
              <Text size="sm">{deactivateError.message}</Text>
            )}
          </Box>
        ) : null}
      </ConfirmModal>
    </Stack>
  );
}
