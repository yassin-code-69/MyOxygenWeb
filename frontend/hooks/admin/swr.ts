"use client";

/**
 * SWR plumbing shared by every back-office hook.
 *
 * Keys are `[path, params]` tuples (the shape `swrFetcher` / `swrPageFetcher`
 * expect). A hook passes `allowed = false` when the user lacks the permission,
 * which turns the key into `null` so no request the backend would reject is
 * ever sent.
 */
import { useCallback } from "react";
import useSWR, { useSWRConfig, type KeyedMutator, type SWRConfiguration } from "swr";
import {
  swrFetcher,
  swrPageFetcher,
  type ApiError,
  type Page,
  type QueryParams,
  type QueryValue,
} from "../../lib/api-client";
import type { PaginationMeta } from "../../types/api";

export type AdminKey = readonly [string, QueryParams];

/** Drops empty values so equivalent filters share one cache entry. */
export function cleanParams(params: Record<string, QueryValue>): QueryParams {
  const result: Record<string, QueryValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    result[key] = value;
  }
  return result;
}

const LIST_OPTIONS: SWRConfiguration = {
  // Keep the previous page on screen while the next one loads (no skeleton flash).
  keepPreviousData: true,
};

/** Paginated list (`data[]` + `meta`). */
export function useAdminPage<T, M extends PaginationMeta = PaginationMeta>(
  path: string,
  params: Record<string, QueryValue>,
  allowed: boolean,
  options?: SWRConfiguration<Page<T, M>, ApiError>,
) {
  const key: AdminKey | null = allowed ? [path, cleanParams(params)] : null;
  return useSWR<Page<T, M>, ApiError, AdminKey | null>(key, (k: AdminKey) => swrPageFetcher<T, M>(k), {
    ...LIST_OPTIONS,
    ...options,
  });
}

/** Single resource (`data`). Pass `path = null` to skip. */
export function useAdminResource<T>(
  path: string | null,
  params: Record<string, QueryValue>,
  allowed: boolean,
  options?: SWRConfiguration<T, ApiError>,
) {
  const key: AdminKey | null = allowed && path ? [path, cleanParams(params)] : null;
  return useSWR<T, ApiError, AdminKey | null>(key, (k: AdminKey) => swrFetcher<T>(k), options);
}

function keyMatches(key: unknown, prefixes: readonly string[]): boolean {
  const path = Array.isArray(key) ? key[0] : key;
  return typeof path === "string" && prefixes.some((prefix) => path.startsWith(prefix));
}

/**
 * Revalidates every cached admin query whose path starts with one of the
 * prefixes, e.g. `revalidate("/admin/orders", "/admin/analytics")`.
 */
export function useAdminRevalidate() {
  const { mutate } = useSWRConfig();
  return useCallback(
    (...prefixes: string[]) => mutate((key) => keyMatches(key, prefixes)),
    [mutate],
  );
}

/** Replaces one item (matched by id) inside a page. */
export function replaceInPage<T extends { id: string }, M extends PaginationMeta>(
  page: Page<T, M>,
  id: string,
  update: (item: T) => T,
): Page<T, M> {
  return { ...page, items: page.items.map((item) => (item.id === id ? update(item) : item)) };
}

export interface OptimisticItemUpdate<T extends { id: string }, M extends PaginationMeta, R> {
  /** Bound mutator of the list on screen. */
  mutate: KeyedMutator<Page<T, M>>;
  /** The list data currently displayed. */
  current: Page<T, M> | undefined;
  id: string;
  /** Immediate, predictable change shown while the request runs. */
  optimistic: (item: T) => T;
  request: () => Promise<R>;
  /** Folds the server response into the row. */
  merge: (item: T, result: R) => T;
}

/**
 * Optimistically updates one row of a cached list, sends the request, then
 * writes the server's answer into the row. Rolls back and rethrows on error.
 */
export async function updateItemOptimistically<T extends { id: string }, M extends PaginationMeta, R>({
  mutate,
  current,
  id,
  optimistic,
  request,
  merge,
}: OptimisticItemUpdate<T, M, R>): Promise<R> {
  let result: R | undefined;
  let received = false;
  await mutate(
    async (latest) => {
      result = await request();
      received = true;
      const settled = result;
      return latest ? replaceInPage(latest, id, (item) => merge(item, settled)) : latest;
    },
    {
      optimisticData: current ? replaceInPage(current, id, optimistic) : undefined,
      rollbackOnError: true,
      populateCache: true,
      revalidate: false,
    },
  );
  if (!received) {
    throw new Error("The update did not complete.");
  }
  return result as R;
}
