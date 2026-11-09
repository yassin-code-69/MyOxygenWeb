"use client";

import { useMemo } from "react";
import { DatePickerInput, type DatesRangeValue, type DatePickerPreset } from "@mantine/dates";
import { IconCalendar } from "@tabler/icons-react";
import { addDaysToCalendarDate, todayInDhaka } from "./format";

export type DateRange = [string | null, string | null];

export interface DateRangeFilterProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
  label?: string;
  placeholder?: string;
  /** Upper bound (default: today in Dhaka). Pass `null` for no bound. */
  maxDate?: string | null;
  width?: number | string;
}

function buildPresets(today: string): DatePickerPreset<"range">[] {
  const monthStart = `${today.slice(0, 8)}01`;
  return [
    { label: "Today", value: [today, today] },
    { label: "Last 7 days", value: [addDaysToCalendarDate(today, -6), today] },
    { label: "Last 30 days", value: [addDaysToCalendarDate(today, -29), today] },
    { label: "This month", value: [monthStart, today] },
    { label: "Last 90 days", value: [addDaysToCalendarDate(today, -89), today] },
  ];
}

/**
 * Inclusive `YYYY-MM-DD` range picker (days are Dhaka calendar days, which is
 * how the API interprets `from` / `to`). Clearable; presets for common ranges.
 */
export function DateRangeFilter({
  value,
  onChange,
  label = "Date range",
  placeholder = "All dates",
  maxDate,
  width = 260,
}: DateRangeFilterProps) {
  const today = todayInDhaka();
  const presets = useMemo(() => buildPresets(today), [today]);

  return (
    <DatePickerInput
      type="range"
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={(next: DatesRangeValue<string>) => onChange([next[0] ?? null, next[1] ?? null])}
      presets={presets}
      clearable
      allowSingleDateInRange
      maxDate={maxDate === null ? undefined : (maxDate ?? today)}
      valueFormat="D MMM YYYY"
      leftSection={<IconCalendar size={16} aria-hidden />}
      w={width}
      radius="xl"
    />
  );
}

/** True when both ends are set or both are empty (a half-picked range is not applied yet). */
export function isCompleteRange(range: DateRange): boolean {
  return (range[0] === null) === (range[1] === null);
}
