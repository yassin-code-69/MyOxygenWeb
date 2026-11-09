"use client";

/**
 * URL-backed report state, so every report view is shareable:
 *
 *   const [range, setRange] = useUrlDateRange("last30");   // ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   const [tab, setTab] = useUrlEnum("tab", TABS, "overview");
 *
 * Updates use `router.replace` (no history entry per tweak, no scroll jump).
 * Invalid or out-of-bounds values in a pasted URL fall back to the default.
 */
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DATE_RANGE_PRESETS,
  MAX_RANGE_DAYS,
  createDateRange,
  rangeDays,
  resolvePresetRange,
  type DateRangePreset,
  type DateRangeValue,
} from "../kit";
import { todayInDhaka } from "../format";

type FixedPreset = Exclude<DateRangePreset, "custom">;

const FIXED_PRESETS = DATE_RANGE_PRESETS.filter((preset): preset is FixedPreset => preset !== "custom");

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string | null): value is string {
  if (!value || !ISO_DAY.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** The preset whose range equals `[from, to]` today, or `custom`. */
export function presetForRange(from: string, to: string, today: string = todayInDhaka()): DateRangePreset {
  return (
    FIXED_PRESETS.find((preset) => {
      const range = resolvePresetRange(preset, today);
      return range.from === from && range.to === to;
    }) ?? "custom"
  );
}

/** A valid report range from raw query values, or `null` (bad format, reversed, future, > 366 days). */
export function parseRangeParams(from: string | null, to: string | null, today: string = todayInDhaka()): DateRangeValue | null {
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to || to > today) {
    return null;
  }
  if (rangeDays({ from, to }) > MAX_RANGE_DAYS) {
    return null;
  }
  return { from, to, preset: presetForRange(from, to, today) };
}

/** Replaces some query parameters (`null` removes one) while keeping the others. */
export function useReplaceQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
}

/** Report period kept in `?from&to` (inclusive Dhaka dates). Without them: `defaultPreset`. */
export function useUrlDateRange(defaultPreset: FixedPreset = "last30"): [DateRangeValue, (next: DateRangeValue) => void] {
  const searchParams = useSearchParams();
  const replaceQuery = useReplaceQuery();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const today = todayInDhaka();

  const range = useMemo<DateRangeValue>(
    () => parseRangeParams(fromParam, toParam, today) ?? createDateRange(defaultPreset, today),
    [defaultPreset, fromParam, toParam, today],
  );

  const setRange = useCallback(
    (next: DateRangeValue) => {
      replaceQuery({ from: next.from, to: next.to });
    },
    [replaceQuery],
  );

  return [range, setRange];
}

/** A string enum kept in the query (`?tab=categories`); unknown values read as `fallback`. */
export function useUrlEnum<T extends string>(name: string, values: readonly T[], fallback: T): [T, (next: T) => void] {
  const searchParams = useSearchParams();
  const replaceQuery = useReplaceQuery();
  const raw = searchParams.get(name);
  const value = values.find((candidate) => candidate === raw) ?? fallback;
  const setValue = useCallback(
    (next: T) => {
      replaceQuery({ [name]: next === fallback ? null : next });
    },
    [fallback, name, replaceQuery],
  );
  return [value, setValue];
}

/** A free-form string kept in the query (`?categoryId=…`); `null` when absent. */
export function useUrlString(name: string): [string | null, (next: string | null) => void] {
  const searchParams = useSearchParams();
  const replaceQuery = useReplaceQuery();
  const value = searchParams.get(name) || null;
  const setValue = useCallback((next: string | null) => replaceQuery({ [name]: next }), [name, replaceQuery]);
  return [value, setValue];
}

/** `?from&to` suffix for links to other reports over the same period. */
export function rangeQuery(range: { from: string; to: string }): string {
  return `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}
