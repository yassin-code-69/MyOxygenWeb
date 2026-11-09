"use client";

import { ScrollArea, SegmentedControl } from "@mantine/core";
import { formatCount } from "../format";
import classes from "./list-card.module.css";

export interface CountTab<V extends string> {
  value: V;
  label: string;
  /** Shown as a chip; `null`/`undefined` while loading (no chip, no layout jump). */
  count?: number | null;
}

export interface CountTabsProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  tabs: readonly CountTab<V>[];
  /** Accessible name of the radio group ("Order status"). */
  label: string;
}

/**
 * Pill tabs with live counts (mockup "All Products / Best Margin …" row).
 * A radio group under the hood (arrow keys move the selection); scrolls
 * sideways inside its row on phones instead of widening the page.
 */
export function CountTabs<V extends string>({ value, onChange, tabs, label }: CountTabsProps<V>) {
  return (
    <ScrollArea type="auto" scrollbarSize={4} offsetScrollbars="x">
      <SegmentedControl
        radius="xl"
        color="secondaryGreen.8"
        withItemsBorders={false}
        value={value}
        onChange={(next) => {
          const match = tabs.find((tab) => tab.value === next);
          if (match) {
            onChange(match.value);
          }
        }}
        aria-label={label}
        classNames={{ root: classes.tabsRoot, label: classes.segmentLabel }}
        data={tabs.map((tab) => ({
          value: tab.value,
          label: (
            <span className={classes.tabLabel}>
              {tab.label}
              {tab.count !== null && tab.count !== undefined ? (
                <span className={classes.count}>{formatCount(tab.count)}</span>
              ) : null}
            </span>
          ),
        }))}
      />
    </ScrollArea>
  );
}
