"use client";

import Link from "next/link";
import { ActionIcon, Badge, Box, Button, Group, Menu, SegmentedControl, Select, Skeleton, Text, TextInput, UnstyledButton, VisuallyHidden } from "@mantine/core";
import { IconDotsVertical, IconDownload, IconEdit, IconEye, IconPackages, IconSearch } from "@tabler/icons-react";
import type { Page } from "../../../../lib/api-client";
import type { ProfitProductRow, ProfitProductSort, ReportCategoryOption } from "../../../../types/admin-reports";
import type { PaginationMeta } from "../../../../types/api";
import { Thumb, paletteColor } from "../../kit";
import { formatCount, formatMoney } from "../../format";
import { MarginPill } from "../MarginPill";
import { ReportTable, type ReportColumn } from "../ReportTable";
import classes from "../reports.module.css";

/** compact = overview card (mockup), full = Product Profitability tab, detailed = Detailed Report tab. */
export type ProfitTableVariant = "compact" | "full" | "detailed";

export const PROFIT_SORT_LABELS: Record<ProfitProductSort, string> = {
  profit_desc: "Most profit",
  revenue_desc: "Most revenue",
  margin_desc: "Best margin",
  margin_asc: "Lowest margin",
};

/** Sort behind each segment of the compact table ("All Products" ranks by profit). */
const SEGMENT_SORT = { all: "profit_desc", best: "margin_desc", lowest: "margin_asc" } as const satisfies Record<string, ProfitProductSort>;
type Segment = keyof typeof SEGMENT_SORT;

function segmentOf(sort: ProfitProductSort): Segment {
  if (sort === "margin_desc") {
    return "best";
  }
  if (sort === "margin_asc") {
    return "lowest";
  }
  return "all";
}

export interface ProductProfitTableProps {
  variant: ProfitTableVariant;
  page: Page<ProfitProductRow, PaginationMeta> | undefined;
  loading: boolean;
  refreshing: boolean;
  error: unknown;
  onRetry: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  categoryId: string | null;
  onCategoryChange: (value: string | null) => void;
  sort: ProfitProductSort;
  onSortChange: (value: ProfitProductSort) => void;
  categories: readonly ReportCategoryOption[] | undefined;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  selectedId?: string | null;
  onSelect?: (productId: string) => void;
  exporting: boolean;
  onExport: () => void;
  /** Links to the product editor (PRODUCTS_READ). */
  canOpenProducts: boolean;
}

/** Product profitability table with its toolbar (segments or sort, search, category, export). */
export function ProductProfitTable({
  variant,
  page,
  loading,
  refreshing,
  error,
  onRetry,
  search,
  onSearchChange,
  categoryId,
  onCategoryChange,
  sort,
  onSortChange,
  categories,
  onPageChange,
  onLimitChange,
  selectedId,
  onSelect,
  exporting,
  onExport,
  canOpenProducts,
}: ProductProfitTableProps) {
  const categoryIndex = new Map((categories ?? []).map((category, index) => [category.id, index]));
  const filtered = search.trim() !== "" || categoryId !== null;

  const productCell: ReportColumn<ProfitProductRow> = {
    key: "product",
    header: "Product",
    minWidth: variant === "compact" ? 190 : 240,
    cell: (row) => (
      <Group gap="sm" wrap="nowrap">
        <Thumb src={row.image} size={36} />
        <Box style={{ minWidth: 0 }}>
          {onSelect ? (
            <UnstyledButton
              className={classes.selectTitle}
              onClick={() => onSelect(row.productId)}
              aria-pressed={selectedId === row.productId}
              aria-label={`Show profitability of ${row.title}`}
            >
              <Text span inherit lineClamp={1}>
                {row.title}
              </Text>
            </UnstyledButton>
          ) : (
            <Text size="sm" fw={600} lineClamp={1}>
              {row.title}
            </Text>
          )}
          {variant !== "compact" ? (
            <Text size="xs" c="var(--mo-color-text-muted)" lineClamp={1}>
              {row.sku}
            </Text>
          ) : !row.isActive ? (
            <Text size="xs" c="var(--mo-color-text-muted)">
              Inactive
            </Text>
          ) : null}
        </Box>
      </Group>
    ),
    skeleton: (
      <Group gap="sm" wrap="nowrap">
        <Skeleton height={36} width={36} radius="sm" />
        <Skeleton height={11} radius="xl" style={{ flex: 1 }} />
      </Group>
    ),
  };

  const money = (key: string, header: string, value: (row: ProfitProductRow) => number, strong = false): ReportColumn<ProfitProductRow> => ({
    key,
    header,
    align: "right",
    minWidth: variant === "compact" ? 72 : 84,
    cell: (row) => (
      <Text size="sm" fw={strong ? 600 : 500} className={classes.num}>
        {formatMoney(value(row))}
      </Text>
    ),
    skeletonWidth: 56,
  });

  const statusAndActions: ReportColumn<ProfitProductRow>[] = [
    {
      key: "status",
      header: "Status",
      minWidth: 84,
      cell: (row) => (
        <Badge variant="light" radius="xl" size="sm" tt="none" fw={600} color={row.isActive ? "success" : "gray"}>
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      skeletonWidth: 52,
    },
    {
      key: "actions",
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: "right",
      width: 48,
      cell: (row) => (
        <Menu position="bottom-end" withinPortal shadow="dropdown" radius="md">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" radius="xl" aria-label={`Actions for ${row.title}`}>
              <IconDotsVertical size={16} aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {onSelect ? (
              <Menu.Item leftSection={<IconEye size={16} aria-hidden />} onClick={() => onSelect(row.productId)}>
                View profitability
              </Menu.Item>
            ) : null}
            {canOpenProducts ? (
              <Menu.Item component={Link} href={`/admin/products?productId=${encodeURIComponent(row.productId)}`} leftSection={<IconEdit size={16} aria-hidden />}>
                Edit product & costs
              </Menu.Item>
            ) : null}
            {!onSelect && !canOpenProducts ? <Menu.Label>No actions</Menu.Label> : null}
          </Menu.Dropdown>
        </Menu>
      ),
      skeletonWidth: 20,
    },
  ];

  const columns: ReportColumn<ProfitProductRow>[] = [
    productCell,
    {
      key: "category",
      header: "Category",
      minWidth: 104,
      cell: (row) =>
        row.category ? (
          <Badge variant="light" radius="xl" size="sm" tt="none" fw={600} color={paletteColor(categoryIndex.get(row.category.id) ?? 0)} maw={150}>
            {row.category.name}
          </Badge>
        ) : (
          <Text size="xs" c="var(--mo-color-text-muted)">
            Uncategorised
          </Text>
        ),
      skeletonWidth: 72,
    },
    ...(variant !== "compact"
      ? [
          {
            key: "units",
            header: "Units sold",
            align: "right" as const,
            cell: (row: ProfitProductRow) => <Text size="sm" className={classes.num}>{formatCount(row.unitsSold)}</Text>,
            skeletonWidth: 32,
          },
          money("revenue", "Revenue", (row) => row.revenue),
        ]
      : []),
    ...(variant === "detailed" ? [money("cogs", "Cost (COGS)", (row) => row.cogs)] : []),
    ...(variant !== "compact" ? [money("profit", "Gross profit", (row) => row.profit, true)] : []),
    money("selling", variant === "compact" ? "Selling Price" : "Avg. price", (row) => row.sellingPrice),
    money("cost", "Avg. Cost", (row) => row.avgCost),
    {
      key: "unitProfit",
      header: variant === "compact" ? "Profit" : "Profit / unit",
      align: "right",
      minWidth: 80,
      cell: (row) => (
        <Text size="sm" fw={600} className={classes.num} c={row.profitPerUnit < 0 ? "var(--mo-color-danger-8)" : "var(--mo-color-success-8)"}>
          {formatMoney(row.profitPerUnit)}
        </Text>
      ),
      skeletonWidth: 48,
    },
    {
      key: "margin",
      header: "Margin",
      align: "center",
      minWidth: variant === "compact" ? 72 : 84,
      cell: (row) => <MarginPill percent={row.marginPercent} size="sm" />,
      skeletonWidth: 52,
    },
    ...(variant === "compact" ? [] : statusAndActions),
  ];

  const minWidth = variant === "compact" ? 700 : variant === "full" ? 1080 : 1180;

  return (
    <>
      <Group justify="space-between" gap="sm" px="lg" pb="md" wrap="wrap" align="flex-end">
        {variant === "compact" ? (
          <SegmentedControl
            size="xs"
            radius="xl"
            color="secondaryGreen.8"
            value={segmentOf(sort)}
            onChange={(value) => onSortChange(SEGMENT_SORT[value === "best" || value === "lowest" ? value : "all"])}
            data={[
              { value: "all", label: "All Products" },
              { value: "best", label: "Best Margin" },
              { value: "lowest", label: "Lowest Margin" },
            ]}
            aria-label="Rank products"
          />
        ) : (
          <Select
            size="xs"
            radius="xl"
            w={170}
            aria-label="Sort products"
            allowDeselect={false}
            value={sort}
            onChange={(value) => {
              const next = (Object.keys(PROFIT_SORT_LABELS) as ProfitProductSort[]).find((option) => option === value);
              if (next) {
                onSortChange(next);
              }
            }}
            data={(Object.keys(PROFIT_SORT_LABELS) as ProfitProductSort[]).map((value) => ({ value, label: PROFIT_SORT_LABELS[value] }))}
            comboboxProps={{ withinPortal: true }}
          />
        )}
        <Group gap="xs" wrap="wrap" align="flex-end">
          <TextInput
            size="xs"
            radius="xl"
            w={180}
            placeholder="Search product…"
            aria-label="Search products"
            leftSection={<IconSearch size={14} aria-hidden />}
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
          <Select
            size="xs"
            radius="xl"
            w={150}
            placeholder="All Categories"
            aria-label="Filter by category"
            clearable
            value={categoryId}
            onChange={onCategoryChange}
            data={(categories ?? []).map((category) => ({ value: category.id, label: category.name }))}
            comboboxProps={{ withinPortal: true }}
          />
          <Button
            size="xs"
            radius="xl"
            variant="default"
            leftSection={<IconDownload size={14} aria-hidden />}
            onClick={onExport}
            loading={exporting}
            disabled={!page || page.meta.total === 0}
          >
            Export
          </Button>
        </Group>
      </Group>
      <ReportTable
        columns={columns}
        rows={page?.items}
        getRowKey={(row) => row.productId}
        label="Product profitability"
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRetry={onRetry}
        skeletonRows={10}
        dense={variant === "compact"}
        minWidth={minWidth}
        selectedKey={onSelect ? selectedId : undefined}
        onRowClick={onSelect ? (row) => onSelect(row.productId) : undefined}
        emptyTitle={filtered ? "No products match these filters" : "No products yet"}
        emptyDescription={filtered ? "Clear the search or pick another category." : "Products appear here once they are added to the catalog."}
        emptyIcon={<IconPackages stroke={1.6} />}
        pagination={
          page
            ? {
                page: page.meta.page,
                totalPages: page.meta.totalPages,
                total: page.meta.total,
                limit: page.meta.limit,
                onPageChange,
                onLimitChange,
                itemLabel: "products",
                pageSizes: variant === "detailed" ? [20, 50, 100] : [10, 20, 50],
              }
            : undefined
        }
      />
    </>
  );
}
