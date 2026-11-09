"use client";

import { ActionIcon, Button, Group, Tooltip } from "@mantine/core";
import { IconCalendarPlus, IconX } from "@tabler/icons-react";
import { DateRangePicker, createDateRange, type DateRangePreset, type DateRangeValue } from "../kit";

/** "Any date" is the unbounded option, so the 366-day "All time" preset is left out. */
const PRESETS: readonly Exclude<DateRangePreset, "custom" | "allTime">[] = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "last3m",
  "last6m",
  "thisYear",
  "lastYear",
];

export interface OptionalDateRangeProps {
  /** `null` = no date filter. */
  value: DateRangeValue | null;
  onChange: (value: DateRangeValue | null) => void;
  /** What the dates filter ("Placed", "Issued"). */
  label: string;
}

/**
 * Optional date filter for lists that default to every date (orders,
 * invoices, ledger). "Any date" starts a range at the last 30 days and shows
 * the kit `DateRangePicker` (presets + custom calendar); × goes back to any date.
 * Dates are inclusive Asia/Dhaka days, as the API reads `from` / `to`.
 */
export function OptionalDateRange({ value, onChange, label }: OptionalDateRangeProps) {
  if (!value) {
    return (
      <Button
        variant="default"
        radius="xl"
        h={40}
        fw={500}
        leftSection={<IconCalendarPlus size={18} aria-hidden />}
        onClick={() => onChange(createDateRange("last30"))}
        aria-label={`${label}: any date. Filter by date`}
      >
        {label}: any date
      </Button>
    );
  }
  return (
    <Group gap={4} wrap="nowrap" maw="100%">
      <DateRangePicker value={value} onChange={onChange} presets={PRESETS} label={label} />
      <Tooltip label="Any date">
        <ActionIcon variant="subtle" color="gray" radius="xl" size={36} onClick={() => onChange(null)} aria-label={`Clear the ${label.toLowerCase()} date filter`}>
          <IconX size={16} aria-hidden />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
