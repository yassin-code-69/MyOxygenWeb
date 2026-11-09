import { Group, Text, type MantineSize } from "@mantine/core";
import { IconArrowDownRight, IconArrowUpRight, IconMinus } from "@tabler/icons-react";
import type { AdminKpi } from "../../../types/admin-dashboard";
import { formatPercent } from "../format";

export interface TrendBadgeProps {
  /** Percent change vs the previous period. `null`/`undefined` renders nothing. */
  changePercent?: number | null;
  /** Shortcut: read `changePercent` from a contract `Kpi`. */
  kpi?: AdminKpi | null;
  /** For costs/expenses: a rise is bad (red), a fall is good (green). */
  invert?: boolean;
  /** Text size. Default `sm`. */
  size?: Extract<MantineSize, "xs" | "sm">;
  /** Screen-reader context appended to the announcement ("vs previous 7 days"). */
  context?: string;
}

/**
 * `▲ 12%` / `▼ 4.5%` trend indicator. Green when the change is good, red when
 * bad (`invert` flips it); the arrow direction and the announced text carry the
 * meaning, so color is never the only signal.
 *
 * ```tsx
 * <TrendBadge kpi={summary.kpis.revenue} context="vs previous 7 days" />
 * ```
 */
export function TrendBadge({ changePercent, kpi, invert = false, size = "sm", context }: TrendBadgeProps) {
  const percent = changePercent ?? kpi?.changePercent ?? null;
  if (percent === null || !Number.isFinite(percent)) {
    return null;
  }
  const flat = Math.abs(percent) < 0.05;
  const up = percent > 0;
  const good = flat ? null : up !== invert;
  const color = good === null ? "var(--mo-color-text-secondary)" : good ? "var(--mo-color-success-8)" : "var(--mo-color-danger-8)";
  const Arrow = flat ? IconMinus : up ? IconArrowUpRight : IconArrowDownRight;
  const value = formatPercent(Math.abs(percent));
  const announcement = flat ? `No change${context ? ` ${context}` : ""}` : `${up ? "Up" : "Down"} ${value}${context ? ` ${context}` : ""}`;

  return (
    <Group component="span" gap={2} wrap="nowrap" display="inline-flex" c={color} aria-label={announcement} role="img">
      <Arrow size={size === "xs" ? 13 : 15} stroke={2.4} aria-hidden />
      <Text component="span" size={size} fw={700} c="inherit" className="mo-tabular-nums" aria-hidden>
        {value}
      </Text>
    </Group>
  );
}
