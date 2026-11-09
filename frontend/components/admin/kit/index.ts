/**
 * Admin UI kit — the building blocks of every back-office page.
 *
 *   import { PageHeader, KpiCard, SectionCard, AreaTrendChart, DateRangePicker } from "@/components/admin/kit";
 *   // (relative today: "../../../components/admin/kit")
 *
 * Everything here uses design tokens only (no hex), Tabler icons, Mantine
 * primitives and @mantine/charts; data components take `data | undefined`
 * plus `loading` and render a same-size skeleton and an EmptyState.
 */
export { PageHeader, type PageHeaderProps } from "./PageHeader";
export { KpiCard, type KpiCardProps, type KpiValueFormat } from "./KpiCard";
export { SectionCard, type SectionCardProps } from "./SectionCard";
export { TrendBadge, type TrendBadgeProps } from "./TrendBadge";
export { ThumbCell, Thumb, type ThumbCellProps, type ThumbProps } from "./ThumbCell";
export { AreaTrendChart, type AreaTrendChartProps, type TrendPoint } from "./AreaTrendChart";
export { DonutWithLegend, type DonutWithLegendProps, type DonutSegment } from "./DonutWithLegend";
export {
  ComboTrendChart,
  type ComboTrendChartProps,
  type ComboDatum,
  type ComboSeries,
  type ComboLineSeries,
} from "./ComboTrendChart";
export {
  ChartViewToggle,
  formatAxisValue,
  formatChartValue,
  renderChartTooltip,
  type ChartViewToggleProps,
  type ChartValueFormat,
  type ChartView,
  type ChartTooltipSeries,
} from "./chart-utils";
export { ProgressList, type ProgressListProps, type ProgressItem } from "./ProgressList";
export { RankedProductList, type RankedProductListProps, type RankedItem } from "./RankedProductList";
export { ActivityFeed, type ActivityFeedProps } from "./ActivityFeed";
export { QuickActions, type QuickActionsProps, type QuickAction } from "./QuickActions";
export { DateRangePicker, type DateRangePickerProps } from "./DateRangePicker";
export {
  DATE_RANGE_PRESETS,
  DATE_RANGE_PRESET_LABELS,
  MAX_RANGE_DAYS,
  addMonthsToCalendarDate,
  createDateRange,
  formatRangeDates,
  formatRangeLabel,
  previousPeriodCaption,
  rangeDays,
  resolvePresetRange,
  type DateRangePreset,
  type DateRangeValue,
} from "./date-range";
export {
  CHART_PALETTE,
  KPI_TONES,
  TONES,
  cssColor,
  paletteColor,
  toneFromColor,
  type KpiTone,
  type ToneStyle,
} from "./tones";
export { useNow } from "./use-now";
