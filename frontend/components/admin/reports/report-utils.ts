/**
 * Small helpers shared by the report pages.
 */
import type { MantineColor } from "@mantine/core";
import { formatMoney } from "../format";

/** Pill color for a margin percentage: loss → danger, thin → warning, healthy → success. */
export function marginColor(percent: number): MantineColor {
  if (percent < 0) {
    return "danger";
  }
  if (percent < 15) {
    return "warning";
  }
  return "success";
}

/** Whole-taka amount for dense cells and headline numbers (`৳1,28,410`). */
export function formatTaka(value: number): string {
  return formatMoney(Math.round(value));
}

/** File-name safe date part: `2026-10-11_to_2026-11-09`. */
export function rangeFileSuffix(range: { from: string; to: string }): string {
  return `${range.from}_to_${range.to}`;
}

/** Container-query breakpoints for report grids (columns follow the content width, not the viewport). */
export const REPORT_GRID_BREAKPOINTS = { xs: "480px", sm: "640px", md: "760px", lg: "940px", xl: "1100px" };
