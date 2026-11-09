"use client";

import { startTransition, useCallback, useMemo, useOptimistic } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  EMPTY_CATALOG_FILTERS,
  parseCatalogFilters,
  serializeCatalogFilters,
  type CatalogFilters,
} from "../../components/catalog/catalog-filters";

export interface UseCatalogFiltersOptions {
  /** `true` on `/categories/[slug]` (the category is fixed by the route). */
  lockCategory?: boolean;
}

export interface UpdateFiltersOptions {
  /** Keep the current page (default: any filter change returns to page 1). */
  keepPage?: boolean;
}

/**
 * Explorer filter state backed by the URL (shareable, survives refresh, back/forward).
 *
 * - The URL is the single source of truth: state is parsed from `useSearchParams`.
 * - Changes call `router.replace(..., { scroll: false })` inside a transition; `useOptimistic`
 *   shows the new state immediately while the navigation commits, so the UI never lags
 *   and there is no URL ↔ state synchronisation effect to drift.
 * - Must be rendered inside `<Suspense>` (uses `useSearchParams`).
 */
export function useCatalogFilters({ lockCategory = false }: UseCatalogFiltersOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const urlFilters = useMemo(
    () => parseCatalogFilters(new URLSearchParams(queryString), { lockCategory }),
    [queryString, lockCategory]
  );

  const [filters, setOptimisticFilters] = useOptimistic(
    urlFilters,
    (_current: CatalogFilters, next: CatalogFilters) => next
  );

  const commit = useCallback(
    (next: CatalogFilters) => {
      const nextQuery = serializeCatalogFilters(next, { lockCategory });
      startTransition(() => {
        setOptimisticFilters(next);
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
      });
    },
    [lockCategory, pathname, router, setOptimisticFilters]
  );

  const updateFilters = useCallback(
    (patch: Partial<CatalogFilters>, { keepPage = false }: UpdateFiltersOptions = {}) => {
      const next: CatalogFilters = { ...filters, ...patch };
      if (!keepPage && patch.page === undefined) {
        next.page = 1;
      }
      // A relevance sort is meaningless without a search query.
      if (next.sort === "relevance" && !next.q.trim()) {
        next.sort = null;
      }
      commit(next);
    },
    [commit, filters]
  );

  const setPage = useCallback(
    (page: number) => updateFilters({ page: Math.max(1, Math.floor(page)) }, { keepPage: true }),
    [updateFilters]
  );

  /** Clears every filter; keeps the search text unless `includeSearch` is set. */
  const resetFilters = useCallback(
    ({ includeSearch = false }: { includeSearch?: boolean } = {}) => {
      commit({
        ...EMPTY_CATALOG_FILTERS,
        q: includeSearch ? "" : filters.q,
        sort: includeSearch ? null : filters.sort,
      });
    },
    [commit, filters.q, filters.sort]
  );

  return { filters, updateFilters, setPage, resetFilters };
}
