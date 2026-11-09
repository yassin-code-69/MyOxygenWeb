"use client";

/**
 * Operating expenses (SUPER_ADMIN, Admin v2 → Expenses in docs/API_CONTRACT.md).
 *
 * - `useExpenses(query)` — one page of `GET /admin/expenses` (+ `meta.totalAmount`).
 * - `useExpenseCategoryTotals(range)` — the range total per category, read
 *   from `meta.byCategory` of a single `limit=1` request.
 * - `useExpenseMutations(list)` — create / update / delete with optimistic
 *   updates of the list on screen, then a revalidation of every expense and
 *   profit query (net profit depends on expenses).
 */
import { useCallback } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { api, type ApiError, type Page } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import type { AdminDateRange } from "../../types/admin-dashboard";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseCreatePayload,
  type ExpenseDTO,
  type ExpenseListMeta,
  type ExpenseListQuery,
  type ExpenseUpdatePayload,
} from "../../types/admin-reports";
import { cleanParams, updateItemOptimistically, useAdminPage, useAdminRevalidate, type AdminKey } from "./swr";
import { useIsSuperAdmin } from "./use-reports";

const EXPENSES_PATH = "/admin/expenses";

export type ExpensesPage = Page<ExpenseDTO, ExpenseListMeta>;

/** `GET /admin/expenses?from&to&category&page&limit`, newest `incurredOn` first. */
export function useExpenses(query: ExpenseListQuery) {
  const allowed = useIsSuperAdmin();
  const swr = useAdminPage<ExpenseDTO, ExpenseListMeta>(
    EXPENSES_PATH,
    {
      from: query.from ?? undefined,
      to: query.to ?? undefined,
      category: query.category ?? undefined,
      page: query.page,
      limit: query.limit,
    },
    allowed,
    { revalidateOnFocus: false },
  );
  return { ...swr, allowed };
}

export interface ExpenseCategoryTotal {
  category: ExpenseCategory;
  amount: number;
  /** Number of expense entries. */
  count: number;
}

async function categoryTotalsFetcher([path, params]: AdminKey): Promise<ExpenseCategoryTotal[]> {
  const page = await api.getPage<ExpenseDTO, ExpenseListMeta>(path, { from: params.from, to: params.to, page: 1, limit: 1 });
  const totals = new Map((page.meta.byCategory ?? []).map((row) => [row.category, row]));
  return EXPENSE_CATEGORIES.map((category) => {
    const row = totals.get(category);
    return { category, amount: row?.amount ?? 0, count: row?.count ?? 0 };
  });
}

/** Total spent per category in the range (all eight categories, zeros included). */
export function useExpenseCategoryTotals(range: AdminDateRange) {
  const allowed = useIsSuperAdmin();
  // `view` only separates this entry from the list pages in the cache; the
  // fetcher sends from/to (plus category, page, limit) and nothing else.
  const key: AdminKey | null = allowed ? [EXPENSES_PATH, cleanParams({ from: range.from, to: range.to, view: "by-category" })] : null;
  const swr = useSWR<ExpenseCategoryTotal[], ApiError, AdminKey | null>(key, categoryTotalsFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  return { ...swr, allowed };
}

export interface ExpenseListHandle {
  mutate: KeyedMutator<ExpensesPage>;
  current: ExpensesPage | undefined;
  query: ExpenseListQuery;
}

function matchesQuery(expense: Pick<ExpenseDTO, "category" | "incurredOn">, query: ExpenseListQuery): boolean {
  if (query.category && expense.category !== query.category) {
    return false;
  }
  if (query.from && expense.incurredOn < query.from) {
    return false;
  }
  if (query.to && expense.incurredOn > query.to) {
    return false;
  }
  return true;
}

/** Same order as the API: incurredOn desc, then createdAt desc. */
function compareExpenses(a: ExpenseDTO, b: ExpenseDTO): number {
  if (a.incurredOn !== b.incurredOn) {
    return a.incurredOn < b.incurredOn ? 1 : -1;
  }
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

/** Placeholder rows shown while a create request runs carry this id prefix. */
export const OPTIMISTIC_EXPENSE_PREFIX = "optimistic-";

export function isOptimisticExpense(expense: Pick<ExpenseDTO, "id">): boolean {
  return expense.id.startsWith(OPTIMISTIC_EXPENSE_PREFIX);
}

function withRow(page: ExpensesPage, row: ExpenseDTO, query: ExpenseListQuery): ExpensesPage {
  const items = [...page.items, row].sort(compareExpenses).slice(0, query.limit);
  const total = page.meta.total + 1;
  return {
    items,
    meta: { ...page.meta, total, totalPages: Math.max(1, Math.ceil(total / page.meta.limit)), totalAmount: page.meta.totalAmount + row.amount },
  };
}

function withoutRow(page: ExpensesPage, id: string): ExpensesPage {
  const removed = page.items.find((item) => item.id === id);
  if (!removed) {
    return page;
  }
  const total = Math.max(0, page.meta.total - 1);
  return {
    items: page.items.filter((item) => item.id !== id),
    meta: {
      ...page.meta,
      total,
      totalPages: Math.max(1, Math.ceil(total / page.meta.limit)),
      totalAmount: Math.max(0, page.meta.totalAmount - removed.amount),
    },
  };
}

/** Expense writes. Each one updates the list on screen first, then revalidates expenses + profit. */
export function useExpenseMutations(list: ExpenseListHandle) {
  const revalidate = useAdminRevalidate();
  const user = useAuthStore((state) => state.user);
  const { mutate, current, query } = list;

  const refresh = useCallback(() => revalidate(EXPENSES_PATH, "/admin/reports/profit"), [revalidate]);

  const createExpense = useCallback(
    async (payload: ExpenseCreatePayload): Promise<ExpenseDTO> => {
      const now = new Date().toISOString();
      const placeholder: ExpenseDTO = {
        id: `${OPTIMISTIC_EXPENSE_PREFIX}${now}`,
        category: payload.category,
        amount: payload.amount,
        incurredOn: payload.incurredOn,
        vendor: payload.vendor ?? null,
        note: payload.note ?? null,
        createdBy: user ? { id: user.id, fullName: user.fullName } : null,
        createdAt: now,
        updatedAt: now,
      };
      const showOptimistic = Boolean(current) && query.page === 1 && matchesQuery(placeholder, query);
      const result: { created?: ExpenseDTO } = {};
      await mutate(
        async (latest) => {
          const created = await api.post<ExpenseDTO>(EXPENSES_PATH, payload);
          result.created = created;
          return latest && query.page === 1 && matchesQuery(created, query) ? withRow(latest, created, query) : latest;
        },
        {
          optimisticData: showOptimistic && current ? withRow(current, placeholder, query) : undefined,
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        },
      );
      void refresh();
      if (!result.created) {
        throw new Error("The expense was not saved.");
      }
      return result.created;
    },
    [current, mutate, query, refresh, user],
  );

  const updateExpense = useCallback(
    async (expense: ExpenseDTO, payload: ExpenseUpdatePayload): Promise<ExpenseDTO> => {
      const updated = await updateItemOptimistically<ExpenseDTO, ExpenseListMeta, ExpenseDTO>({
        mutate,
        current,
        id: expense.id,
        optimistic: (item) => ({
          ...item,
          category: payload.category ?? item.category,
          amount: payload.amount ?? item.amount,
          incurredOn: payload.incurredOn ?? item.incurredOn,
          vendor: payload.vendor === undefined ? item.vendor : payload.vendor,
          note: payload.note === undefined ? item.note : payload.note,
        }),
        request: () => api.patch<ExpenseDTO>(`${EXPENSES_PATH}/${encodeURIComponent(expense.id)}`, payload),
        merge: (_item, result) => result,
      });
      void refresh();
      return updated;
    },
    [current, mutate, refresh],
  );

  const deleteExpense = useCallback(
    async (expense: ExpenseDTO): Promise<void> => {
      await mutate(
        async (latest) => {
          await api.delete<void>(`${EXPENSES_PATH}/${encodeURIComponent(expense.id)}`);
          return latest ? withoutRow(latest, expense.id) : latest;
        },
        {
          optimisticData: current ? withoutRow(current, expense.id) : undefined,
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        },
      );
      void refresh();
    },
    [current, mutate, refresh],
  );

  return { createExpense, updateExpense, deleteExpense };
}
