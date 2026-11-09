"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Box, Group, Skeleton, Text } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import type { AdminKpi } from "../../../types/admin-dashboard";
import { formatCount, formatMoney, formatPercent } from "../format";
import { TrendBadge } from "./TrendBadge";
import { TONES, type KpiTone } from "./tones";
import classes from "./kit.module.css";

export type KpiValueFormat = "currency" | "count" | "percent";

export interface KpiCardProps {
  /** Metric name ("Total Revenue"). */
  label: string;
  /** Icon element, e.g. `<IconCash size={24} />` (24px reads best in the 48px badge). */
  icon: ReactNode;
  /** Pastel tone. Default `mint`. */
  tone?: KpiTone;
  /** Contract KPI: drives the value (via `format`) and the ▲/▼ trend. */
  kpi?: AdminKpi | null;
  /** How `kpi.value` is printed. Default `count`. */
  format?: KpiValueFormat;
  /** Pre-formatted value; overrides the `kpi` value (e.g. `lowStockCount`). */
  value?: ReactNode;
  /** Caption under the trend. Default `vs previous period`. */
  trendCaption?: string;
  /** A rise is bad (costs). */
  invertTrend?: boolean;
  /** Shown instead of the trend line when there is no trend (e.g. "At or below alert level"). */
  hint?: ReactNode;
  /** Extra node beside the value (legacy badges). */
  badge?: ReactNode;
  /** Drill-down link ("View Details →"). */
  href?: string;
  linkLabel?: string;
  /** Skeleton with identical dimensions. */
  loading?: boolean;
  className?: string;
  style?: CSSProperties;
}

function formatKpiValue(value: number, format: KpiValueFormat): string {
  if (format === "currency") {
    return formatMoney(Math.round(value));
  }
  if (format === "percent") {
    return formatPercent(value);
  }
  return formatCount(value);
}

/**
 * Pastel metric tile (mockup KPI row): circular icon badge, label, headline
 * value, ▲/▼ trend vs the previous period, optional "View Details →".
 * The trend line is hidden when `changePercent` is `null` (no previous data).
 * Rows have fixed heights so the loading skeleton never shifts the layout.
 *
 * ```tsx
 * <KpiCard tone="mint" icon={<IconCash size={24} />} label="Total Revenue"
 *   kpi={data?.kpis.revenue} format="currency" trendCaption="vs previous 7 days" loading={!data} />
 * ```
 */
export function KpiCard({
  label,
  icon,
  tone = "mint",
  kpi,
  format = "count",
  value,
  trendCaption = "vs previous period",
  invertTrend = false,
  hint,
  badge,
  href,
  linkLabel = "View Details",
  loading = false,
  className,
  style,
}: KpiCardProps) {
  const palette = TONES[tone];
  const vars = {
    "--kpi-surface": palette.surface,
    "--kpi-border": palette.border,
    "--kpi-icon-bg": palette.iconBg,
    "--kpi-icon": palette.icon,
  } as CSSProperties;
  const displayValue = value ?? (kpi ? formatKpiValue(kpi.value, format) : "—");
  const hasTrend = Boolean(kpi && kpi.changePercent !== null);

  return (
    <Box className={[classes.kpi, className].filter(Boolean).join(" ")} style={{ ...vars, ...style }} aria-busy={loading || undefined}>
      <div className={classes.kpiIcon} aria-hidden>
        {icon}
      </div>
      <div className={classes.kpiBody}>
        <Text component="p" className={classes.kpiLabel} m={0} truncate>
          {label}
        </Text>
        {loading ? (
          <>
            <Box mt={4} h={36} display="flex" style={{ alignItems: "center" }}>
              <Skeleton height={26} width="70%" radius="sm" />
            </Box>
            <Box mt={6} h={18} display="flex" style={{ alignItems: "center" }}>
              <Skeleton height={12} width={56} radius="xl" />
            </Box>
            <Box h={18} display="flex" style={{ alignItems: "center" }}>
              <Skeleton height={10} width="60%" radius="xl" />
            </Box>
          </>
        ) : (
          <>
            <Group gap={8} wrap="nowrap" align="center">
              <div className={classes.kpiValue}>{displayValue}</div>
              {badge}
            </Group>
            <div className={classes.kpiMeta}>
              {hasTrend && kpi ? (
                <TrendBadge kpi={kpi} invert={invertTrend} context={trendCaption} />
              ) : href ? (
                <Link href={href} className={classes.kpiLink}>
                  {linkLabel}
                  <IconArrowRight size={14} stroke={2.2} aria-hidden />
                </Link>
              ) : null}
            </div>
            <div className={classes.kpiCaption}>
              {hasTrend ? (
                <span aria-hidden>{trendCaption}</span>
              ) : hint ? (
                hint
              ) : null}
            </div>
            {hasTrend && href ? (
              <Link href={href} className={classes.kpiLink} style={{ marginTop: 4 }}>
                {linkLabel}
                <IconArrowRight size={14} stroke={2.2} aria-hidden />
              </Link>
            ) : null}
          </>
        )}
      </div>
    </Box>
  );
}
