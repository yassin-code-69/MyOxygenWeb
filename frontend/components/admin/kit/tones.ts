/**
 * Pastel tones for KPI cards, quick-action tiles and icon badges.
 *
 * Each tone is composed from existing design tokens (CSS variables emitted by
 * `tokens/css-variables.ts`) — no new colors. `chart` is the Mantine color
 * used when the tone drives a chart series.
 *
 *   mint     → secondaryGreen   (revenue, primary admin actions)
 *   lavender → accentPurple
 *   sky      → info blue
 *   peach    → warning orange   (stock warnings)
 *   rose     → primaryPink      (alerts, brand highlights)
 */
import type { MantineColor } from "@mantine/core";

export const KPI_TONES = ["mint", "lavender", "sky", "peach", "rose"] as const;
export type KpiTone = (typeof KPI_TONES)[number];

export interface ToneStyle {
  /** Card / tile background. */
  surface: string;
  /** Hairline border on the tinted surface. */
  border: string;
  /** Circular icon badge background. */
  iconBg: string;
  /** Icon color (≥ 3:1 on `iconBg`). */
  icon: string;
  /** Mantine color for chart series and Mantine components. */
  color: MantineColor;
  /** Mantine color + shade for chart fills. */
  chart: MantineColor;
}

export const TONES: Record<KpiTone, ToneStyle> = {
  mint: {
    surface: "var(--mo-color-secondary-0)",
    border: "var(--mo-color-secondary-1)",
    iconBg: "var(--mo-color-secondary-1)",
    icon: "var(--mo-color-secondary-8)",
    color: "secondaryGreen",
    chart: "secondaryGreen.6",
  },
  lavender: {
    surface: "var(--mo-color-accent-0)",
    border: "var(--mo-color-accent-1)",
    iconBg: "var(--mo-color-accent-1)",
    icon: "var(--mo-color-accent-8)",
    color: "accentPurple",
    chart: "accentPurple.6",
  },
  sky: {
    surface: "var(--mo-color-info-0)",
    border: "var(--mo-color-info-1)",
    iconBg: "var(--mo-color-info-1)",
    icon: "var(--mo-color-info-8)",
    color: "info",
    chart: "info.5",
  },
  peach: {
    surface: "var(--mo-tint-peach-light)",
    border: "var(--mo-tint-peach)",
    iconBg: "var(--mo-tint-peach)",
    icon: "var(--mo-color-warning-8)",
    color: "warning",
    chart: "warning.6",
  },
  rose: {
    surface: "var(--mo-color-primary-0)",
    border: "var(--mo-color-primary-1)",
    iconBg: "var(--mo-color-primary-1)",
    icon: "var(--mo-color-primary-8)",
    color: "primaryPink",
    chart: "primaryPink.6",
  },
};

/** Categorical series colors (in order): green, purple, orange, pink, blue. */
export const CHART_PALETTE: readonly MantineColor[] = [
  "secondaryGreen.6",
  "accentPurple.6",
  "warning.6",
  "primaryPink.6",
  "info.5",
];

/** Palette color for the n-th series (wraps around). */
export function paletteColor(index: number): MantineColor {
  return CHART_PALETTE[index % CHART_PALETTE.length] ?? "secondaryGreen.6";
}

/** Maps a legacy `color` prop (Mantine color name) onto the closest tone. */
export function toneFromColor(color: MantineColor | undefined): KpiTone {
  switch (color) {
    case "accentPurple":
    case "violet":
      return "lavender";
    case "info":
    case "blue":
      return "sky";
    case "warning":
    case "yellow":
    case "orange":
      return "peach";
    case "primaryPink":
    case "pink":
    case "danger":
    case "red":
      return "rose";
    default:
      return "mint";
  }
}

/** `"secondaryGreen.6"` / `"secondaryGreen"` → `var(--mantine-color-secondaryGreen-6)`. */
export function cssColor(color: MantineColor, defaultShade = 6): string {
  const [name, shade] = color.split(".");
  return `var(--mantine-color-${name}-${shade ?? defaultShade})`;
}
