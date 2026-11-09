"use client";

/**
 * URL-synced page state for the management pages (customers, categories,
 * brands, delivery, payments, settings): filters, tabs, pages and the open
 * drawer live in the query string, so every view can be deep-linked, shared
 * and restored with the back button.
 *
 *   const { searchParams, setParams } = useUrlParams();
 *   setParams({ status: "PAID", page: null }); // null / "" removes a key
 *
 *   const [range, setRange] = useUrlDateRange("last30");
 *   // presets are stored as `?range=last7`, custom ranges as `?from=…&to=…`
 */
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { todayInDhaka } from "../format";
import {
  DATE_RANGE_PRESETS,
  MAX_RANGE_DAYS,
  createDateRange,
  rangeDays,
  type DateRangePreset,
  type DateRangeValue,
} from "../kit";

export type UrlParamPatch = Readonly<Record<string, string | number | null | undefined>>;

/** The query string plus a `setParams(patch)` that replaces the URL (no scroll, no history entry). */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParams = useCallback(
    (patch: UrlParamPatch) => {
      // Read the live location so two quick updates never overwrite each other.
      const next = new URLSearchParams(typeof window === "undefined" ? searchParams.toString() : window.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  /** Href of this page with `patch` applied (for links that change filters). */
  const hrefWith = useCallback(
    (patch: UrlParamPatch) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams],
  );

  return { searchParams, setParams, hrefWith };
}

/** A positive integer query param (`?page=3`), or `fallback`. */
export function readPositiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : fallback;
}

/** One of `allowed`, or `fallback`. */
export function readEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

type FixedPreset = Exclude<DateRangePreset, "custom">;

const FIXED_PRESETS = DATE_RANGE_PRESETS.filter((preset): preset is FixedPreset => preset !== "custom");
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Reads `?range=` (preset) or `?from&to` (custom, validated against the API's 366-day cap). */
export function readDateRangeParams(params: URLSearchParams, fallback: FixedPreset, today: string = todayInDhaka()): DateRangeValue {
  const preset = params.get("range");
  const fixed = FIXED_PRESETS.find((item) => item === preset);
  if (fixed) {
    return createDateRange(fixed, today);
  }
  const from = params.get("from");
  const to = params.get("to");
  if (
    from &&
    to &&
    DATE_PATTERN.test(from) &&
    DATE_PATTERN.test(to) &&
    from <= to &&
    to <= today &&
    rangeDays({ from, to }) <= MAX_RANGE_DAYS
  ) {
    return { from, to, preset: "custom" };
  }
  return createDateRange(fallback, today);
}

/** The query-string patch that stores `value` (the default preset leaves the URL clean). */
export function dateRangePatch(value: DateRangeValue, fallback: FixedPreset): UrlParamPatch {
  if (value.preset === "custom") {
    return { range: null, from: value.from, to: value.to };
  }
  return { range: value.preset === fallback ? null : value.preset, from: null, to: null };
}

/** Date-range state stored in the URL. Changing it resets `?page`. */
export function useUrlDateRange(fallback: FixedPreset): [DateRangeValue, (value: DateRangeValue) => void] {
  const { searchParams, setParams } = useUrlParams();
  const today = todayInDhaka();
  const rangeParam = searchParams.get("range");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const range = useMemo(() => {
    const params = new URLSearchParams();
    if (rangeParam) {
      params.set("range", rangeParam);
    }
    if (fromParam) {
      params.set("from", fromParam);
    }
    if (toParam) {
      params.set("to", toParam);
    }
    return readDateRangeParams(params, fallback, today);
  }, [fallback, fromParam, rangeParam, toParam, today]);

  const setRange = useCallback(
    (value: DateRangeValue) => setParams({ ...dateRangePatch(value, fallback), page: null }),
    [fallback, setParams],
  );

  return [range, setRange];
}
