"use client";

import type { ReactNode } from "react";
import { Box, Group, Pagination, Paper, Select, Skeleton, Stack, Table, Text, UnstyledButton } from "@mantine/core";
import { IconArrowDown, IconUsers } from "@tabler/icons-react";
import { EmptyState } from "../../EmptyState";
import { Price } from "../../Price";
import { formatBangladeshMobile } from "../../../lib/phone";
import { PERMISSIONS } from "../../../types/auth";
import type { PaginationMeta } from "../../../types/api";
import type { AdminCustomerListItem, AdminCustomerSort } from "../../../types/admin-management";
import { QueryError } from "../QueryError";
import { formatCount, formatDhakaDate, formatRelativeTimeShort } from "../format";
import { ActiveBadge } from "./ActiveBadge";
import { CustomerAvatar } from "./CustomerAvatar";
import classes from "./customers.module.css";

const PAGE_SIZES = ["10", "20", "50", "100"];

export interface CustomersTableProps {
  rows: readonly AdminCustomerListItem[] | undefined;
  meta: PaginationMeta | undefined;
  loading: boolean;
  refreshing: boolean;
  error: unknown;
  onRetry: () => void;
  sort: AdminCustomerSort;
  onSortChange: (sort: AdminCustomerSort) => void;
  onOpen: (customer: AdminCustomerListItem) => void;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  /** Search text (changes the empty state wording). */
  query: string;
  emptyAction?: ReactNode;
}

interface SortHeaderProps {
  label: string;
  value: AdminCustomerSort;
  current: AdminCustomerSort;
  onChange: (sort: AdminCustomerSort) => void;
  /** What the sort means, for screen readers ("highest spend first"). */
  description: string;
}

function SortHeader({ label, value, current, onChange, description }: SortHeaderProps) {
  const active = current === value;
  return (
    <UnstyledButton
      className={classes.sortButton}
      data-active={active || undefined}
      onClick={() => onChange(value)}
      aria-label={`${label}: sort ${description}`}
      aria-pressed={active}
    >
      {label}
      <IconArrowDown size={13} stroke={2.2} className={classes.sortIcon} aria-hidden />
    </UnstyledButton>
  );
}

function HeaderText({ children }: { children: ReactNode }) {
  return (
    <Text component="span" size="xs" fw={600} c="var(--mo-color-text-secondary)" style={{ whiteSpace: "nowrap" }}>
      {children}
    </Text>
  );
}

const COLUMN_COUNT = 7;

/**
 * Customers table: sortable headers (the API sorts newest / spend / orders,
 * highest first), whole-row click opens the detail drawer (the name is the
 * keyboard-reachable button), skeleton rows with the loaded layout, and a
 * pagination footer. Scrolls horizontally inside its card on phones.
 */
export function CustomersTable({
  rows,
  meta,
  loading,
  refreshing,
  error,
  onRetry,
  sort,
  onSortChange,
  onOpen,
  onPageChange,
  onLimitChange,
  query,
  emptyAction,
}: CustomersTableProps) {
  const showSkeleton = loading && !rows;
  const showError = Boolean(error) && !rows;
  const isEmpty = !showSkeleton && !showError && rows !== undefined && rows.length === 0;
  const ariaSort = (value: AdminCustomerSort) => (sort === value ? "descending" : "none");

  let body: ReactNode;
  if (showSkeleton) {
    body = Array.from({ length: 10 }, (_, index) => (
      <Table.Tr key={`skeleton-${index}`} aria-hidden>
        <Table.Td>
          <Group gap="sm" wrap="nowrap">
            <Skeleton circle height={36} />
            <Stack gap={6}>
              <Skeleton height={12} width={130} radius="xl" />
              <Skeleton height={10} width={170} radius="xl" />
            </Stack>
          </Group>
        </Table.Td>
        <Table.Td>
          <Skeleton height={12} width={96} radius="xl" />
        </Table.Td>
        <Table.Td>
          <Skeleton height={12} width={24} radius="xl" ml="auto" />
        </Table.Td>
        <Table.Td>
          <Skeleton height={12} width={72} radius="xl" ml="auto" />
        </Table.Td>
        <Table.Td>
          <Skeleton height={12} width={80} radius="xl" />
        </Table.Td>
        <Table.Td>
          <Skeleton height={12} width={84} radius="xl" />
        </Table.Td>
        <Table.Td>
          <Skeleton height={20} width={68} radius="xl" />
        </Table.Td>
      </Table.Tr>
    ));
  } else if (showError) {
    body = (
      <Table.Tr>
        <Table.Td colSpan={COLUMN_COUNT} p="md">
          <QueryError error={error} onRetry={onRetry} permission={PERMISSIONS.ORDERS_READ} compact />
        </Table.Td>
      </Table.Tr>
    );
  } else if (isEmpty) {
    body = (
      <Table.Tr>
        <Table.Td colSpan={COLUMN_COUNT}>
          <EmptyState
            withCard={false}
            size="sm"
            color="secondaryGreen"
            icon={<IconUsers stroke={1.6} />}
            title={query ? "No customers match your search" : "No customers yet"}
            description={
              query
                ? "Try a name, email, or part of a phone number."
                : "Customers appear here as soon as someone creates an account."
            }
            action={emptyAction}
          />
        </Table.Td>
      </Table.Tr>
    );
  } else {
    body = (rows ?? []).map((customer) => (
      <Table.Tr key={customer.id} className={classes.row} onClick={() => onOpen(customer)}>
        <Table.Td miw={240}>
          <UnstyledButton
            className={classes.nameButton}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(customer);
            }}
            aria-label={`Open ${customer.fullName}`}
          >
            <Group gap="sm" wrap="nowrap">
              <CustomerAvatar name={customer.fullName} seed={customer.id} />
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} c="var(--mo-color-text)" truncate className={classes.name}>
                  {customer.fullName}
                </Text>
                <Text size="xs" c={customer.email ? "var(--mo-color-text-muted)" : "var(--mo-color-text-subtle)"} truncate maw={240}>
                  {customer.email ?? "No email"}
                </Text>
              </Box>
            </Group>
          </UnstyledButton>
        </Table.Td>
        <Table.Td>
          <Text size="sm" c="var(--mo-color-text-strong)" className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
            {formatBangladeshMobile(customer.phone)}
          </Text>
        </Table.Td>
        <Table.Td ta="right">
          <Text size="sm" fw={600} className="mo-tabular-nums">
            {formatCount(customer.ordersCount)}
          </Text>
        </Table.Td>
        <Table.Td ta="right">
          <Price value={customer.totalSpent} size="sm" fw={600} />
        </Table.Td>
        <Table.Td>
          {customer.lastOrderAt ? (
            <Text component="time" dateTime={customer.lastOrderAt} size="sm" c="var(--mo-color-text-secondary)" title={formatDhakaDate(customer.lastOrderAt)} style={{ whiteSpace: "nowrap" }}>
              {formatRelativeTimeShort(customer.lastOrderAt)}
            </Text>
          ) : (
            <Text size="sm" c="var(--mo-color-text-subtle)" style={{ whiteSpace: "nowrap" }}>
              No orders yet
            </Text>
          )}
        </Table.Td>
        <Table.Td>
          <Text component="time" dateTime={customer.createdAt} size="sm" c="var(--mo-color-text-secondary)" style={{ whiteSpace: "nowrap" }}>
            {formatDhakaDate(customer.createdAt)}
          </Text>
        </Table.Td>
        <Table.Td miw={104}>
          <ActiveBadge active={customer.isActive} />
        </Table.Td>
      </Table.Tr>
    ));
  }

  const firstItem = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const lastItem = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <Paper withBorder radius="md" shadow="xs" style={{ overflow: "hidden" }}>
      <Table.ScrollContainer minWidth={860} maxHeight="min(70dvh, 760px)" type="native">
        <Table
          stickyHeader
          verticalSpacing="sm"
          horizontalSpacing="md"
          aria-label="Customers"
          aria-busy={showSkeleton || refreshing}
        >
          <Table.Thead bg="var(--mo-color-surface-muted)">
            <Table.Tr>
              <Table.Th scope="col">
                <HeaderText>Customer</HeaderText>
              </Table.Th>
              <Table.Th scope="col">
                <HeaderText>Phone</HeaderText>
              </Table.Th>
              <Table.Th scope="col" ta="right" aria-sort={ariaSort("orders_desc")}>
                <SortHeader label="Orders" value="orders_desc" current={sort} onChange={onSortChange} description="most orders first" />
              </Table.Th>
              <Table.Th scope="col" ta="right" aria-sort={ariaSort("spend_desc")}>
                <SortHeader label="Total spent" value="spend_desc" current={sort} onChange={onSortChange} description="highest spend first" />
              </Table.Th>
              <Table.Th scope="col">
                <HeaderText>Last order</HeaderText>
              </Table.Th>
              <Table.Th scope="col" aria-sort={ariaSort("newest")}>
                <SortHeader label="Joined" value="newest" current={sort} onChange={onSortChange} description="newest first" />
              </Table.Th>
              <Table.Th scope="col">
                <HeaderText>Status</HeaderText>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody className={classes.body} data-refreshing={(refreshing && Boolean(rows)) || undefined}>
            {body}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {meta && meta.total > 0 ? (
        <Group
          justify="space-between"
          gap="sm"
          px="md"
          py="sm"
          wrap="wrap"
          style={{ borderTop: "1px solid var(--mo-color-border-subtle)" }}
        >
          <Text size="sm" c="dimmed" className="mo-tabular-nums" aria-live="polite">
            {formatCount(firstItem)}–{formatCount(lastItem)} of {formatCount(meta.total)} customers
          </Text>
          <Group gap="sm" wrap="wrap">
            <Box w={110}>
              <Select
                aria-label="Rows per page"
                size="xs"
                radius="xl"
                data={PAGE_SIZES.map((size) => ({ value: size, label: `${size} / page` }))}
                value={String(meta.limit)}
                allowDeselect={false}
                onChange={(value) => {
                  if (value) {
                    onLimitChange(Number(value));
                  }
                }}
              />
            </Box>
            {meta.totalPages > 1 ? (
              <Pagination
                size="sm"
                total={meta.totalPages}
                value={Math.min(meta.page, meta.totalPages)}
                onChange={onPageChange}
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
