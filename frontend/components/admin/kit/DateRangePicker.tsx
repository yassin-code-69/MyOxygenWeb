"use client";

import { useState } from "react";
import { Box, Button, Divider, Group, Popover, Stack, Text, UnstyledButton } from "@mantine/core";
import { DateInput, DatePicker, type DatesRangeValue } from "@mantine/dates";
import { IconCalendar, IconCalendarEvent, IconCheck, IconChevronDown, IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { todayInDhaka } from "../format";
import {
  DATE_RANGE_PRESETS,
  DATE_RANGE_PRESET_LABELS,
  MAX_RANGE_DAYS,
  formatRangeLabel,
  rangeDays,
  resolvePresetRange,
  type DateRangePreset,
  type DateRangeValue,
} from "./date-range";
import classes from "./kit.module.css";

type FixedPreset = Exclude<DateRangePreset, "custom">;

const DEFAULT_PRESETS = DATE_RANGE_PRESETS.filter((preset): preset is FixedPreset => preset !== "custom");

export interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Presets to offer (in order). Default: every preset. */
  presets?: readonly FixedPreset[];
  /** Earliest selectable day (`YYYY-MM-DD`). */
  minDate?: string;
  /** Latest selectable day. Default: today in Dhaka. */
  maxDate?: string;
  /** Longest allowed custom range. Default 366 (the API limit). */
  maxSpanDays?: number;
  /** Accessible name prefix. Default "Date range". */
  label?: string;
  /** Trigger width. */
  w?: number | string;
  disabled?: boolean;
}

/** The preset whose range equals `[from, to]`, or `custom`. */
function matchPreset(from: string, to: string, presets: readonly FixedPreset[], today: string): DateRangePreset {
  return presets.find((preset) => {
    const range = resolvePresetRange(preset, today);
    return range.from === from && range.to === to;
  }) ?? "custom";
}

/**
 * Report period picker (mockup 2): preset list — Today, Yesterday, Last 7 /
 * 30 days, Last 3 / 6 months, This year, Last year, All time (= the last 366
 * days, the API maximum) — plus a custom range calendar with From / To inputs
 * and Apply. Emits inclusive `YYYY-MM-DD` Dhaka dates.
 *
 * ```tsx
 * const [range, setRange] = useState(() => createDateRange("last30"));
 * <DateRangePicker value={range} onChange={setRange} />
 * // useSomeReport({ from: range.from, to: range.to })
 * ```
 */
export function DateRangePicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  minDate,
  maxDate,
  maxSpanDays = MAX_RANGE_DAYS,
  label = "Date range",
  w,
  disabled = false,
}: DateRangePickerProps) {
  const today = todayInDhaka();
  const upper = maxDate ?? today;
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<[string | null, string | null]>([value.from, value.to]);

  const open = () => {
    setDraft([value.from, value.to]);
    setOpened(true);
  };

  const choosePreset = (preset: FixedPreset) => {
    onChange({ ...resolvePresetRange(preset, today), preset });
    setOpened(false);
  };

  const [draftFrom, draftTo] = draft;
  const ordered = draftFrom && draftTo && draftFrom > draftTo ? ([draftTo, draftFrom] as const) : ([draftFrom, draftTo] as const);
  const span = ordered[0] && ordered[1] ? rangeDays({ from: ordered[0], to: ordered[1] }) : 0;
  const tooLong = span > maxSpanDays;
  const complete = Boolean(ordered[0] && ordered[1]);

  const apply = () => {
    const [from, to] = ordered;
    if (!from || !to || tooLong) {
      return;
    }
    onChange({ from, to, preset: matchPreset(from, to, presets, today) });
    setOpened(false);
  };

  const triggerText = formatRangeLabel(value);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="dropdown"
      radius="md"
      trapFocus
      returnFocus
      withinPortal
    >
      <Popover.Target>
        <Button
          variant="default"
          radius="xl"
          h={40}
          w={w}
          fw={500}
          disabled={disabled}
          onClick={() => (opened ? setOpened(false) : open())}
          leftSection={<IconCalendar size={18} aria-hidden />}
          rightSection={<IconChevronDown size={16} aria-hidden />}
          aria-haspopup="dialog"
          aria-expanded={opened}
          aria-label={`${label}: ${triggerText}`}
          styles={{ label: { overflow: "hidden", textOverflow: "ellipsis" } }}
        >
          {triggerText}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={0} maw="calc(100vw - 24px)" aria-label={label}>
        <Group align="stretch" gap={0} wrap="wrap">
          <Stack gap={2} p="xs" w={210} style={{ borderRight: "1px solid var(--mo-color-border-subtle)" }}>
            {presets.map((preset) => {
              const active = value.preset === preset;
              return (
                <UnstyledButton
                  key={preset}
                  className={classes.presetButton}
                  data-active={active || undefined}
                  aria-pressed={active}
                  onClick={() => choosePreset(preset)}
                >
                  <IconCalendarEvent size={16} aria-hidden />
                  <Box style={{ flex: 1 }}>
                    <span>{DATE_RANGE_PRESET_LABELS[preset]}</span>
                    {preset === "allTime" ? (
                      <Text size="xs" c="var(--mo-color-text-muted)" lh={1.3}>
                        Last {MAX_RANGE_DAYS} days (report limit)
                      </Text>
                    ) : null}
                  </Box>
                  {active ? <IconCheck size={16} aria-hidden /> : null}
                </UnstyledButton>
              );
            })}
            <Divider my={4} color="var(--mo-color-border-subtle)" />
            <Box className={classes.presetButton} data-active={value.preset === "custom" || undefined}>
              <IconAdjustmentsHorizontal size={16} aria-hidden />
              <span>{DATE_RANGE_PRESET_LABELS.custom}</span>
            </Box>
          </Stack>

          <Stack gap="sm" p="sm" style={{ flex: "1 1 280px" }}>
            <DatePicker
              type="range"
              value={draft}
              onChange={(next: DatesRangeValue<string>) => setDraft([next[0] ?? null, next[1] ?? null])}
              defaultDate={value.to}
              maxDate={upper}
              minDate={minDate}
              allowSingleDateInRange
              size="sm"
              aria-label="Choose a custom range"
            />
            <Group grow gap="xs" wrap="nowrap">
              <DateInput
                label="From"
                size="xs"
                radius="md"
                valueFormat="DD/MM/YYYY"
                value={draftFrom}
                onChange={(next) => setDraft([next, draftTo])}
                maxDate={upper}
                minDate={minDate}
                popoverProps={{ withinPortal: false }}
              />
              <DateInput
                label="To"
                size="xs"
                radius="md"
                valueFormat="DD/MM/YYYY"
                value={draftTo}
                onChange={(next) => setDraft([draftFrom, next])}
                maxDate={upper}
                minDate={minDate}
                popoverProps={{ withinPortal: false }}
              />
            </Group>
            {tooLong ? (
              <Text size="xs" c="var(--mantine-color-error)" role="alert">
                Pick {maxSpanDays} days or fewer ({span} selected).
              </Text>
            ) : null}
            <Button color="secondaryGreen.8" radius="xl" fullWidth onClick={apply} disabled={!complete || tooLong}>
              Apply
            </Button>
          </Stack>
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}
