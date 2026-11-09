import { Badge, Tooltip, type MantineSize } from "@mantine/core";
import { ADMIN_COST_COMPONENTS, type AdminCostBreakdown, type AdminCostComponent } from "../../../types/admin";
import { formatMoney, formatPercent } from "../format";

export const COST_COMPONENT_LABELS: Record<AdminCostComponent, string> = {
  supplierPrice: "Supplier price",
  shipping: "International shipping",
  customsDuty: "Customs / duty / tax",
  packaging: "Packaging",
  other: "Other cost",
};

const toPaisa = (value: number): number => Math.round(value * 100);

/** Landed cost = sum of the components, added in whole paisa (as the API does). */
export function landedCost(breakdown: AdminCostBreakdown): number {
  return ADMIN_COST_COMPONENTS.reduce((sum, key) => sum + toPaisa(breakdown[key] || 0), 0) / 100;
}

/** Gross margin of one unit, % of the selling price; `null` when there is no price. */
export function marginPercent(price: number, cost: number): number | null {
  if (!(price > 0) || !Number.isFinite(cost)) {
    return null;
  }
  return ((price - cost) / price) * 100;
}

/** Healthy ≥ 25 %, thin 10–25 %, poor below 10 % (or a loss). */
export function marginColor(percent: number | null): "success" | "warning" | "danger" | "gray" {
  if (percent === null) {
    return "gray";
  }
  if (percent >= 25) {
    return "success";
  }
  if (percent >= 10) {
    return "warning";
  }
  return "danger";
}

export interface MarginBadgeProps {
  price: number;
  cost: number;
  size?: MantineSize;
}

/** Margin pill (mockup "Margin" column) with the per-unit profit in its tooltip. */
export function MarginBadge({ price, cost, size = "sm" }: MarginBadgeProps) {
  const percent = marginPercent(price, cost);
  const profit = price - cost;
  return (
    <Tooltip label={`Profit per unit ${profit < 0 ? "−" : ""}${formatMoney(Math.abs(profit))} at ${formatMoney(price)}`}>
      <Badge variant="light" color={marginColor(percent)} size={size} radius="xl" tt="none" fw={700} className="mo-tabular-nums">
        {percent === null ? "—" : formatPercent(percent)}
      </Badge>
    </Tooltip>
  );
}
