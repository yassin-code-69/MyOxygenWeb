"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { Box, Group, Pagination, Select, Skeleton, Table, Text } from "@mantine/core";
import { EmptyState } from "../../EmptyState";
import type { Permission } from "../../../types/auth";
import { QueryError } from "../QueryError";
import { formatCount } from "../format";
import classes from "./reports.module.css";

export interface ReportColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: "left" | "center" | "right";
  width?: number | string;
  /** Keeps badges and amounts from being squeezed. */
  minWidth?: number;
  /** Loading placeholder for this cell (default: a rounded bar). */
  skeleton?: ReactNode;
  /** Skeleton bar width (default 70%). */
  skeletonWidth?: number | string;
}

export interface ReportPagination {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  /** Plural noun for the summary ("products"). */
  itemLabel?: string;
  pageSizes?: readonly number[];
}

export interface ReportTableProps<T> {
  columns: readonly ReportColumn<T>[];
  /** `undefined` until the first response. */
  rows: readonly T[] | undefined;
  getRowKey: (row: T) => string;
  /** Accessible table name. */
  label: string;
  loading?: boolean;
  /** Rows on screen are being replaced (filter / page change). */
  refreshing?: boolean;
  error?: unknown;
  onRetry?: () => void;
  permission?: Permission;
  emptyTitle: string;
  emptyDescription?: ReactNode;
  emptyIcon?: ReactNode;
  emptyAction?: ReactNode;
  skeletonRows?: number;
  /** Below this width the table scrolls inside its card. */
  minWidth?: number;
  /** Max height before the body scrolls under a sticky header. */
  maxHeight?: CSSProperties["maxHeight"];
  /** Highlighted row (e.g. the product shown in a side panel). */
  selectedKey?: string | null;
  /** Mouse convenience; give each row a focusable control for keyboards too. */
  onRowClick?: (row: T) => void;
  /** Dim rows that are still being saved. */
  isRowPending?: (row: T) => boolean;
  /** Tighter cell padding for narrow cards. */
  dense?: boolean;
  pagination?: ReportPagination;
}

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100] as const;

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("a, button, input, select, textarea, [role='menu'], [role='menuitem']"));
}

/**
 * Edge-to-edge table for a flush `SectionCard`: muted header row, skeleton
 * rows with the loaded row height, empty / error rows, optional row
 * selection and a pagination footer. Wide tables scroll inside the card.
 */
export function ReportTable<T>({
  columns,
  rows,
  getRowKey,
  label,
  loading = false,
  refreshing = false,
  error,
  onRetry,
  permission,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyAction,
  skeletonRows = 5,
  minWidth = 640,
  maxHeight,
  selectedKey,
  onRowClick,
  isRowPending,
  dense = false,
  pagination,
}: ReportTableProps<T>) {
  const showSkeleton = loading && !rows;
  const showError = Boolean(error) && !rows;
  const isEmpty = !showSkeleton && !showError && rows !== undefined && rows.length === 0;
  const lastIndex = columns.length - 1;
  const edge = (index: number): CSSProperties | undefined => {
    const minWidthStyle = columns[index]?.minWidth ? { minWidth: columns[index]?.minWidth } : undefined;
    if (index === 0) {
      return { paddingLeft: "var(--mantine-spacing-lg)", ...minWidthStyle };
    }
    if (index === lastIndex) {
      return { paddingRight: "var(--mantine-spacing-lg)", ...minWidthStyle };
    }
    return minWidthStyle;
  };

  let body: ReactNode;
  if (showSkeleton) {
    body = Array.from({ length: skeletonRows }, (_, rowIndex) => (
      <Table.Tr key={`skeleton-${rowIndex}`} aria-hidden>
        {columns.map((column, index) => (
          <Table.Td key={column.key} ta={column.align ?? "left"} style={edge(index)}>
            {column.skeleton ?? (
              <Skeleton height={12} radius="xl" width={column.skeletonWidth ?? "70%"} ml={column.align === "right" ? "auto" : undefined} />
            )}
          </Table.Td>
        ))}
      </Table.Tr>
    ));
  } else if (showError) {
    body = (
      <Table.Tr>
        <Table.Td colSpan={columns.length} p="md">
          <QueryError error={error} onRetry={onRetry} permission={permission} compact />
        </Table.Td>
      </Table.Tr>
    );
  } else if (isEmpty) {
    body = (
      <Table.Tr>
        <Table.Td colSpan={columns.length}>
          <EmptyState withCard={false} size="sm" color="secondaryGreen" title={emptyTitle} description={emptyDescription} icon={emptyIcon} action={emptyAction} />
        </Table.Td>
      </Table.Tr>
    );
  } else {
    body = (rows ?? []).map((row, rowIndex) => {
      const key = getRowKey(row);
      const selected = selectedKey !== undefined && selectedKey === key;
      return (
        <Table.Tr
          key={key}
          className={classes.row}
          data-selected={selected || undefined}
          data-clickable={onRowClick ? true : undefined}
          data-pending={isRowPending?.(row) || undefined}
          aria-selected={onRowClick ? selected : undefined}
          onClick={
            onRowClick
              ? (event: MouseEvent<HTMLTableRowElement>) => {
                  if (!isInteractiveTarget(event.target)) {
                    onRowClick(row);
                  }
                }
              : undefined
          }
        >
          {columns.map((column, index) => (
            <Table.Td key={column.key} ta={column.align ?? "left"} style={edge(index)}>
              {column.cell(row, rowIndex)}
            </Table.Td>
          ))}
        </Table.Tr>
      );
    });
  }

  const firstItem = pagination ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const lastItem = pagination ? Math.min(pagination.page * pagination.limit, pagination.total) : 0;

  return (
    <Box>
      <Table.ScrollContainer minWidth={minWidth} maxHeight={maxHeight} type="native">
        <Table
          className={classes.table}
          verticalSpacing={10}
          horizontalSpacing={dense ? 8 : 12}
          stickyHeader={maxHeight !== undefined}
          highlightOnHover={Boolean(rows && rows.length > 0)}
          aria-label={label}
          aria-busy={showSkeleton || refreshing || undefined}
        >
          <Table.Thead bg="var(--mo-color-surface-muted)">
            <Table.Tr>
              {columns.map((column, index) => (
                <Table.Th key={column.key} scope="col" ta={column.align ?? "left"} w={column.width} style={edge(index)}>
                  {column.header}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody className={classes.tbody} data-refreshing={(refreshing && rows) || undefined}>
            {body}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {pagination && pagination.total > 0 ? (
        <Group justify="space-between" gap="sm" px="lg" py="sm" wrap="wrap" className={classes.footer}>
          <Text size="sm" c="var(--mo-color-text-muted)" className="mo-tabular-nums" aria-live="polite">
            {formatCount(firstItem)}–{formatCount(lastItem)} of {formatCount(pagination.total)} {pagination.itemLabel ?? "rows"}
          </Text>
          <Group gap="sm" wrap="wrap">
            {pagination.onLimitChange ? (
              <Select
                aria-label="Rows per page"
                size="xs"
                radius="xl"
                w={112}
                data={(pagination.pageSizes ?? DEFAULT_PAGE_SIZES).map((size) => ({ value: String(size), label: `${size} / page` }))}
                value={String(pagination.limit)}
                allowDeselect={false}
                onChange={(value) => {
                  if (value) {
                    pagination.onLimitChange?.(Number(value));
                  }
                }}
                comboboxProps={{ withinPortal: true }}
              />
            ) : null}
            {pagination.totalPages > 1 ? (
              <Pagination
                size="sm"
                radius="xl"
                color="secondaryGreen.8"
                total={pagination.totalPages}
                value={Math.min(pagination.page, pagination.totalPages)}
                onChange={pagination.onPageChange}
                siblings={1}
                boundaries={1}
                getControlProps={(control) => ({ "aria-label": `${control} page` })}
                getItemProps={(page) => ({ "aria-label": `Page ${page}` })}
              />
            ) : null}
          </Group>
        </Group>
      ) : null}
    </Box>
  );
}

