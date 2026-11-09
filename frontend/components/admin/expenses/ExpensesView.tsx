"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ActionIcon, Badge, Box, Button, Grid, Group, Select, Stack, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCash, IconCategory, IconEdit, IconPlus, IconReceipt, IconReportMoney, IconTrash } from "@tabler/icons-react";
import {
  isOptimisticExpense,
  useExpenseCategoryTotals,
  useExpenseMutations,
  useExpenses,
} from "../../../hooks/admin/use-expenses";
import { getErrorMessage } from "../../../lib/api-client";
import type { ExpenseCreatePayload, ExpenseDTO, ExpenseListQuery } from "../../../types/admin-reports";
import { ConfirmModal } from "../ConfirmModal";
import { QueryError } from "../QueryError";
import { DateRangePicker, DonutWithLegend, PageHeader, SectionCard, formatRangeDates, useNow } from "../kit";
import { formatCalendarDate, formatCount, formatDhakaDateTime, formatMoney, formatRelativeTimeShort, pluralize } from "../format";
import { ReportKpiGrid } from "../reports/ReportKpiGrid";
import { ReportTable, type ReportColumn } from "../reports/ReportTable";
import { REPORT_GRID_BREAKPOINTS, formatTaka } from "../reports/report-utils";
import { rangeQuery, useReplaceQuery, useUrlDateRange, useUrlString } from "../reports/url-state";
import classes from "../reports/reports.module.css";
import { EXPENSE_CATEGORY_META, EXPENSE_CATEGORY_OPTIONS, isExpenseCategory } from "./expense-meta";
import { ExpenseFormModal } from "./ExpenseFormModal";

/**
 * `/admin/expenses` (SUPER_ADMIN): operating expenses for a period — totals,
 * the mix by category, and a paginated list with add / edit / delete.
 * Period and category live in the URL; `?new=1` opens the add form.
 */
export function ExpensesView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const replaceQuery = useReplaceQuery();
  const now = useNow(60_000);
  const [range, setRange] = useUrlDateRange("last30");
  const [rawCategory, setCategory] = useUrlString("category");
  const category = isExpenseCategory(rawCategory) ? rawCategory : null;

  const signature = `${range.from}|${range.to}|${category ?? ""}`;
  const [paging, setPaging] = useState({ signature, page: 1, limit: 20 });
  const page = paging.signature === signature ? paging.page : 1;
  const query: ExpenseListQuery = { from: range.from, to: range.to, category, page, limit: paging.limit };

  const list = useExpenses(query);
  const totals = useExpenseCategoryTotals(range);
  const { createExpense, updateExpense, deleteExpense } = useExpenseMutations({ mutate: list.mutate, current: list.data, query });

  // `?new=1` (e.g. "Add Expense" on the profit report) opens the form; closing it drops the flag.
  const newRequested = searchParams.get("new") === "1";
  const [form, setForm] = useState<{ opened: boolean; expense: ExpenseDTO | null }>({ opened: false, expense: null });
  const formOpened = form.opened || newRequested;
  const closeForm = () => {
    setForm({ opened: false, expense: null });
    if (newRequested) {
      replaceQuery({ new: null });
    }
  };

  const [deleting, setDeleting] = useState<ExpenseDTO | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const totalsData = totals.isLoading ? undefined : totals.data;
  const listPage = list.data;
  const top = totalsData?.reduce<(typeof totalsData)[number] | null>((best, row) => (row.amount > (best?.amount ?? 0) ? row : best), null) ?? null;
  const rangeTotal = totalsData?.reduce((sum, row) => sum + row.amount, 0);
  const rangeCount = totalsData?.reduce((sum, row) => sum + row.count, 0);
  const periodText = formatRangeDates(range);
  const categoryLabel = category ? EXPENSE_CATEGORY_META[category].label : null;

  const submit = async (payload: ExpenseCreatePayload) => {
    if (form.expense) {
      const updated = await updateExpense(form.expense, payload);
      notifications.show({ color: "success", title: "Expense updated", message: `${EXPENSE_CATEGORY_META[updated.category].label} · ${formatMoney(updated.amount)}` });
      return;
    }
    const created = await createExpense(payload);
    notifications.show({
      color: "success",
      title: "Expense added",
      message: `${formatMoney(created.amount)} for ${EXPENSE_CATEGORY_META[created.category].label.toLowerCase()} on ${formatCalendarDate(created.incurredOn)}.`,
    });
  };

  const confirmDelete = async () => {
    if (!deleting) {
      return;
    }
    setDeleteBusy(true);
    try {
      await deleteExpense(deleting);
      notifications.show({ color: "success", title: "Expense deleted", message: `${EXPENSE_CATEGORY_META[deleting.category].label} · ${formatMoney(deleting.amount)}` });
      setDeleting(null);
    } catch (error) {
      notifications.show({ color: "danger", title: "Couldn't delete the expense", message: getErrorMessage(error) });
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns: ReportColumn<ExpenseDTO>[] = [
    {
      key: "date",
      header: "Date",
      minWidth: 100,
      cell: (row) => (
        <Text size="sm" fw={500} className={classes.nowrap}>
          {formatCalendarDate(row.incurredOn)}
        </Text>
      ),
      skeletonWidth: 72,
    },
    {
      key: "category",
      header: "Category",
      minWidth: 130,
      cell: (row) => {
        const meta = EXPENSE_CATEGORY_META[row.category];
        const Icon = meta.icon;
        return (
          <Badge variant="light" radius="xl" size="sm" tt="none" fw={600} color={meta.color} leftSection={<Icon size={12} aria-hidden />}>
            {meta.label}
          </Badge>
        );
      },
      skeletonWidth: 88,
    },
    {
      key: "vendor",
      header: "Vendor",
      minWidth: 120,
      cell: (row) => (
        <Text size="sm" lineClamp={1} c={row.vendor ? undefined : "var(--mo-color-text-muted)"}>
          {row.vendor ?? "—"}
        </Text>
      ),
    },
    {
      key: "note",
      header: "Note",
      minWidth: 180,
      cell: (row) => (
        <Text size="sm" lineClamp={1} c={row.note ? "var(--mo-color-text-secondary)" : "var(--mo-color-text-muted)"} title={row.note ?? undefined}>
          {row.note ?? "—"}
        </Text>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      minWidth: 100,
      cell: (row) => (
        <Text size="sm" fw={700} className={classes.num}>
          {formatMoney(row.amount)}
        </Text>
      ),
      skeletonWidth: 64,
    },
    {
      key: "createdBy",
      header: "Added by",
      minWidth: 130,
      cell: (row) => (
        <Box>
          <Text size="sm" lineClamp={1}>
            {row.createdBy?.fullName ?? "Unknown"}
          </Text>
          <Text component="time" dateTime={row.createdAt} title={formatDhakaDateTime(row.createdAt)} size="xs" c="var(--mo-color-text-muted)">
            {isOptimisticExpense(row) ? "Saving…" : formatRelativeTimeShort(row.createdAt, now)}
          </Text>
        </Box>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      width: 96,
      cell: (row) => {
        const pending = isOptimisticExpense(row);
        return (
          <Group gap={4} justify="flex-end" wrap="nowrap">
            <Tooltip label="Edit">
              <ActionIcon variant="subtle" color="gray" radius="xl" disabled={pending} aria-label={`Edit ${EXPENSE_CATEGORY_META[row.category].label} expense of ${formatMoney(row.amount)}`} onClick={() => setForm({ opened: true, expense: row })}>
                <IconEdit size={16} aria-hidden />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete">
              <ActionIcon variant="subtle" color="danger" radius="xl" disabled={pending} aria-label={`Delete ${EXPENSE_CATEGORY_META[row.category].label} expense of ${formatMoney(row.amount)}`} onClick={() => setDeleting(row)}>
                <IconTrash size={16} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Group>
        );
      },
      skeletonWidth: 48,
    },
  ];

  const segments = totalsData?.map((row) => ({
    key: row.category,
    label: EXPENSE_CATEGORY_META[row.category].label,
    value: row.amount,
    color: EXPENSE_CATEGORY_META[row.category].chart,
    href: `${pathname}?${rangeQuery(range)}&category=${row.category}`,
  }));

  const failed = Boolean(list.error) && !listPage && Boolean(totals.error) && !totalsData;

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconReportMoney size={18} aria-hidden />}
        title="Expenses"
        subtitle="Operating costs (shipping, marketing, salaries…) that turn gross profit into net profit."
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} label="Expense period" />
            <Button radius="xl" h={40} color="secondaryGreen.8" leftSection={<IconPlus size={16} aria-hidden />} onClick={() => setForm({ opened: true, expense: null })}>
              Add Expense
            </Button>
          </>
        }
        mb={0}
      />

      {failed ? (
        <QueryError error={list.error} onRetry={() => void Promise.all([list.mutate(), totals.mutate()])} title="We couldn't load expenses" />
      ) : (
        <Grid type="container" breakpoints={REPORT_GRID_BREAKPOINTS} gap="md">
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <ReportKpiGrid
              items={[
                {
                  key: "total",
                  tone: "rose",
                  icon: <IconCash size={24} stroke={1.8} />,
                  label: "Total Expenses",
                  value: rangeTotal !== undefined ? formatTaka(rangeTotal) : undefined,
                  hint: periodText,
                  loading: rangeTotal === undefined,
                },
                {
                  key: "entries",
                  tone: "sky",
                  icon: <IconReceipt size={24} stroke={1.8} />,
                  label: "Entries",
                  value: rangeCount !== undefined ? formatCount(rangeCount) : undefined,
                  hint: "Recorded in this period",
                  loading: rangeCount === undefined,
                },
                {
                  key: "top",
                  tone: "lavender",
                  icon: <IconCategory size={24} stroke={1.8} />,
                  label: "Top Category",
                  value: totalsData ? (top ? EXPENSE_CATEGORY_META[top.category].label : "—") : undefined,
                  hint: top ? `${formatTaka(top.amount)} · ${pluralize(top.count, "entry", "entries")}` : "No expenses yet",
                  loading: !totalsData,
                },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <SectionCard title="Expenses by Category" subtitle={`${periodText} · select a category to filter the list`}>
              {totals.error && !totalsData ? (
                <QueryError error={totals.error} onRetry={() => void totals.mutate()} compact title="Category totals didn't load" />
              ) : (
                <Box py={4}>
                  <DonutWithLegend
                    data={segments}
                    loading={!totalsData}
                    totalLabel="Total"
                    format="currency"
                    size={176}
                    thickness={24}
                    emptyTitle="No expenses in this period"
                    emptyDescription="Add one to see how your costs split."
                  />
                </Box>
              )}
            </SectionCard>
          </Grid.Col>
          <Grid.Col span={12}>
            <SectionCard
              title={categoryLabel ? `${categoryLabel} expenses` : "All expenses"}
              subtitle={
                listPage && !list.isLoading
                  ? `${pluralize(listPage.meta.total, "entry", "entries")} · ${formatMoney(listPage.meta.totalAmount)} · ${periodText}`
                  : periodText
              }
              actions={
                <Select
                  size="xs"
                  radius="xl"
                  w={180}
                  placeholder="All categories"
                  aria-label="Filter by category"
                  clearable
                  value={category}
                  onChange={(value) => setCategory(value)}
                  data={EXPENSE_CATEGORY_OPTIONS}
                  comboboxProps={{ withinPortal: true }}
                />
              }
              flush
            >
              <ReportTable
                columns={columns}
                rows={listPage?.items}
                getRowKey={(row) => row.id}
                label="Expenses"
                loading={list.isLoading && !listPage}
                refreshing={list.isLoading && Boolean(listPage)}
                error={list.error}
                onRetry={() => void list.mutate()}
                isRowPending={isOptimisticExpense}
                skeletonRows={8}
                minWidth={900}
                emptyTitle={category ? `No ${categoryLabel?.toLowerCase()} expenses in this period` : "No expenses in this period"}
                emptyDescription="Record shipping, marketing, rent and other running costs so net profit stays accurate."
                emptyIcon={<IconReportMoney stroke={1.6} />}
                emptyAction={
                  <Button size="xs" radius="xl" color="secondaryGreen.8" leftSection={<IconPlus size={14} aria-hidden />} onClick={() => setForm({ opened: true, expense: null })}>
                    Add Expense
                  </Button>
                }
                pagination={
                  listPage
                    ? {
                        page: listPage.meta.page,
                        totalPages: listPage.meta.totalPages,
                        total: listPage.meta.total,
                        limit: listPage.meta.limit,
                        onPageChange: (next) => setPaging({ signature, page: next, limit: paging.limit }),
                        onLimitChange: (limit) => setPaging({ signature, page: 1, limit }),
                        itemLabel: "entries",
                      }
                    : undefined
                }
              />
            </SectionCard>
          </Grid.Col>
        </Grid>
      )}

      <ExpenseFormModal opened={formOpened} expense={form.expense} onClose={closeForm} onSubmit={submit} />

      <ConfirmModal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this expense?"
        message={
          deleting
            ? `${EXPENSE_CATEGORY_META[deleting.category].label} · ${formatMoney(deleting.amount)} on ${formatCalendarDate(deleting.incurredOn)}${
                deleting.vendor ? ` (${deleting.vendor})` : ""
              }. Net profit for that period goes up by the same amount. This can't be undone.`
            : ""
        }
        confirmLabel="Delete expense"
        color="danger"
        loading={deleteBusy}
      />
    </Stack>
  );
}
