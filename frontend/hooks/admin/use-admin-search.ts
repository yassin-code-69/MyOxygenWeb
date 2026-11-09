"use client";

import { useDebouncedValue } from "@mantine/hooks";
import { useAuthStore } from "../../lib/auth-store";
import { isStaffRole } from "../../types/auth";
import { ADMIN_SEARCH_MIN_LENGTH, type AdminSearchResults } from "../../types/admin-dashboard";
import { useAdminResource } from "./swr";

export const ADMIN_SEARCH_DEBOUNCE_MS = 250;

/**
 * Global back-office search (`GET /admin/search?q=`, any staff role).
 * The query is debounced by 250 ms and only sent once it has at least two
 * characters; groups the user may not read come back empty from the API.
 */
export function useAdminSearch(query: string) {
  const role = useAuthStore((state) => state.user?.role ?? null);
  const [debounced] = useDebouncedValue(query.trim(), ADMIN_SEARCH_DEBOUNCE_MS);
  const ready = debounced.length >= ADMIN_SEARCH_MIN_LENGTH;
  const swr = useAdminResource<AdminSearchResults>(
    "/admin/search",
    { q: debounced },
    ready && isStaffRole(role),
    { keepPreviousData: true, revalidateOnFocus: false, dedupingInterval: 10_000 },
  );
  /** True while the typed query has not been answered yet (debounce or request). */
  const pending = query.trim().length >= ADMIN_SEARCH_MIN_LENGTH && (query.trim() !== debounced || swr.isLoading);
  return { ...swr, query: debounced, ready, pending };
}
