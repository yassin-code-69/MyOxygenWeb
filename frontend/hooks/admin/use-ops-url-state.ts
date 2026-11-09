"use client";

/**
 * URL-backed state for the operations pages (orders, products, batches,
 * expiry, discounts …).
 *
 * Deep links such as `/admin/orders?orderId=…` or `/admin/products?new=1` can
 * arrive while the page is already mounted (sidebar "Add Product", the global
 * search, the dashboard). Reading drawers, modals and preset filters straight
 * from the query string — instead of copying them into `useState` once — keeps
 * the page in sync with every navigation, and keeps the URL shareable.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";

/** `null` / `undefined` / `""` removes the parameter. */
export type UrlParamUpdates = Readonly<Record<string, string | null | undefined>>;

export interface UrlParamsHandle {
  /** The current query string (reactive). */
  searchParams: ReadonlyURLSearchParams;
  /**
   * Merges `updates` into the current query string with `router.replace`
   * (no scroll jump, no new history entry). Pass every change of one user
   * action in a single call.
   */
  setParams: (updates: UrlParamUpdates) => void;
}

export function useUrlParams(): UrlParamsHandle {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Query written by the last `setParams` that the router hasn't committed yet,
  // so two calls in one event ("save → open the drawer", then "close the
  // modal") build on each other instead of the stale location.
  const pending = useRef<string | null>(null);

  useEffect(() => {
    pending.current = null;
  }, [searchParams]);

  const setParams = useCallback(
    (updates: UrlParamUpdates) => {
      const base = pending.current ?? (typeof window === "undefined" ? searchParams.toString() : window.location.search);
      const next = new URLSearchParams(base);
      for (const [name, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") {
          next.delete(name);
        } else {
          next.set(name, value);
        }
      }
      const query = next.toString();
      pending.current = query;
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, searchParams, router],
  );

  return { searchParams, setParams };
}

export interface PagingState {
  page: number;
  limit: number;
  setPage: (page: number) => void;
  /** Changing the page size returns to page 1. */
  setLimit: (limit: number) => void;
}

/**
 * Page + page size for a filtered list. The page falls back to 1 whenever
 * `filterKey` changes — including filter changes that come from the URL —
 * without an effect or a stale page flashing first.
 */
export function usePaging(filterKey: string, initialLimit = 20): PagingState {
  const [state, setState] = useState({ key: filterKey, page: 1 });
  const [limit, setLimitState] = useState(initialLimit);
  const page = state.key === filterKey ? state.page : 1;
  const setPage = useCallback((next: number) => setState({ key: filterKey, page: next }), [filterKey]);
  const setLimit = useCallback(
    (next: number) => {
      setLimitState(next);
      setState({ key: filterKey, page: 1 });
    },
    [filterKey],
  );
  return { page, limit, setPage, setLimit };
}

/** First allowed value of a query parameter, or `fallback`. */
export function pickParam<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}
