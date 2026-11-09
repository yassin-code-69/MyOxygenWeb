"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  Box,
  Group,
  Pagination,
  Paper,
  Select,
  Skeleton,
  Table,
  Text,
  type MantineBreakpoint,
} from "@mantine/core";
import { EmptyState } from "../EmptyState";
import type { Permission } from "../../types/auth";
import { formatCount } from "./format";
import { QueryError } from "./QueryError";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  width?: number | string;
  /** Hide the column below this breakpoint. */
  visibleFrom?: MantineBreakpoint;
  /** Skeleton bar width while loading (default 70%). */
  skeletonWidth?: number | string;
}

export interface DataTablePagination {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  /** Plural noun for the summary line ("orders"). */
  itemLabel?: string;
}

export interface DataTableRowStyle {
  /** Row background (CSS color or `var(--…)`). */
  background?: string;
  /** Colored bar on the row's leading edge. */
  accent?: string;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[] | undefined;
  getRowKey: (row: T) => string;
  /** Accessible name of the table. */
  label: string;
  /** First load (no rows yet) — shows skeleton rows. */
  loading?: boolean;
  /** Background refresh of rows already on screen. */
  refreshing?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Permission the query needs (for the 403 panel). */
  permission?: Permission;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyIcon?: ReactNode;
  emptyAction?: ReactNode;
  skeletonRows?: number;
  /** Width at which the table scrolls horizontally. */
  minWidth?: number;
  /** Max height before the body scrolls under the sticky header. */
  maxHeight?: CSSProperties["maxHeight"];
  pagination?: DataTablePagination;
  getRowStyle?: (row: T) => DataTableRowStyle | undefined;
}

const PAGE_SIZES = ["10", "20", "50", "100"];

function cellAlign(align: DataTableColumn<unknown>["align"]): CSSProperties["textAlign"] {
  return align ?? "left";
}

/**
 * Back-office data table: sticky header, skeleton rows on first load, empty
 * and error rows, row accents, and a pagination footer.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  label,
  loading = false,
  refreshing = false,
  error,
  onRetry,
  permission,
  emptyTitle = "Nothing to show yet",
  emptyDescription,
  emptyIcon,
  emptyAction,
  skeletonRows = 8,
  minWidth = 760,
  maxHeight = "min(70dvh, 760px)",
  pagination,
  getRowStyle,
}: DataTableProps<T>) {
  const showSkeleton = loading && !rows;
  const showError = Boolean(error) && !rows;
  const isEmpty = !showSkeleton && !showError && rows !== undefined && rows.length === 0;
  const firstItem = pagination ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const lastItem = pagination ? Math.min(pagination.page * pagination.limit, pagination.total) : 0;

  let body: ReactNode;
  if (showSkeleton) {
    body = Array.from({ length: skeletonRows }, (_, rowIndex) => (
      <Table.Tr key={`skeleton-${rowIndex}`} aria-hidden>
        {columns.map((column) => (
          <Table.Td key={column.key} visibleFrom={column.visibleFrom} ta={cellAlign(column.align)}>
            <Skeleton height={14} radius="xl" width={column.skeletonWidth ?? "70%"} ml={column.align === "right" ? "auto" : undefined} />
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
          <EmptyState
            withCard={false}
            size="sm"
            title={emptyTitle}
            description={emptyDescription}
            icon={emptyIcon}
            action={emptyAction}
          />
        </Table.Td>
      </Table.Tr>
    );
  } else {
    body = (rows ?? []).map((row) => {
      const rowStyle = getRowStyle?.(row);
      return (
        <Table.Tr key={getRowKey(row)} bg={rowStyle?.background}>
          {columns.map((column, index) => (
            <Table.Td
              key={column.key}
              visibleFrom={column.visibleFrom}
              ta={cellAlign(column.align)}
              style={
                index === 0 && rowStyle?.accent
                  ? { boxShadow: `inset 3px 0 0 ${rowStyle.accent}` }
                  : undefined
              }
            >
              {column.cell(row)}
            </Table.Td>
          ))}
        </Table.Tr>
      );
    });
  }

  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      <Table.ScrollContainer minWidth={minWidth} maxHeight={maxHeight} type="native">
        <Table
          stickyHeader
          highlightOnHover={Boolean(rows && rows.length > 0)}
          verticalSpacing="sm"
          horizontalSpacing="md"
          aria-label={label}
          aria-busy={showSkeleton || refreshing}
        >
          <Table.Thead bg="var(--mo-color-surface-muted)">
            <Table.Tr>
              {columns.map((column) => (
                <Table.Th
                  key={column.key}
                  visibleFrom={column.visibleFrom}
                  ta={cellAlign(column.align)}
                  w={column.width}
                  scope="col"
                >
                  <Text component="span" size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                    {column.header}
                  </Text>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody
            style={{
              opacity: refreshing && rows ? 0.6 : 1,
              transition: "opacity var(--mo-duration-fast) var(--mo-ease-out)",
            }}
          >
            {body}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {pagination && pagination.total > 0 ? (
        <Group
          justify="space-between"
          gap="sm"
          px="md"
          py="sm"
          wrap="wrap"
          style={{ borderTop: "1px solid var(--mo-color-border-subtle)" }}
        >
          <Text size="sm" c="dimmed" className="mo-tabular-nums" aria-live="polite">
            {formatCount(firstItem)}–{formatCount(lastItem)} of {formatCount(pagination.total)} {pagination.itemLabel ?? "items"}
          </Text>
          <Group gap="sm" wrap="wrap">
            {pagination.onLimitChange ? (
              <Box w={110}>
                <Select
                  aria-label="Rows per page"
                  size="xs"
                  radius="xl"
                  data={PAGE_SIZES.map((size) => ({ value: size, label: `${size} / page` }))}
                  value={String(pagination.limit)}
                  allowDeselect={false}
                  onChange={(value) => {
                    if (value) {
                      pagination.onLimitChange?.(Number(value));
                    }
                  }}
                />
              </Box>
            ) : null}
            {pagination.totalPages > 1 ? (
              <Pagination
                size="sm"
                total={pagination.totalPages}
                value={Math.min(pagination.page, pagination.totalPages)}
                onChange={pagination.onPageChange}
                siblings={1}
                boundaries={1}
                getControlProps={(control) => ({ "aria-label": `${control} page` })}
              />
            ) : null}
          </Group>
        </Group>
      ) : null}
    </Paper>
  );
}
