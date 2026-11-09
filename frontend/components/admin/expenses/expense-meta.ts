/**
 * Display metadata for expense categories (labels, chart colors, icons).
 * Labels match the API's `expenseBreakdown[].label` wording.
 */
import type { MantineColor } from "@mantine/core";
import {
  IconBolt,
  IconBuildingStore,
  IconDots,
  IconPackage,
  IconSpeakerphone,
  IconTruck,
  IconTruckDelivery,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "../../../types/admin-reports";

export interface ExpenseCategoryMeta {
  label: string;
  /** Badge color (Mantine color name). */
  color: MantineColor;
  /** Chart color with shade. */
  chart: MantineColor;
  icon: Icon;
}

export const EXPENSE_CATEGORY_META: Record<ExpenseCategory, ExpenseCategoryMeta> = {
  SHIPPING: { label: "Shipping", color: "info", chart: "info.5", icon: IconTruck },
  MARKETING: { label: "Marketing", color: "primaryPink", chart: "primaryPink.5", icon: IconSpeakerphone },
  DELIVERY_SUBSIDY: { label: "Delivery subsidy", color: "warning", chart: "warning.5", icon: IconTruckDelivery },
  PACKAGING: { label: "Packaging", color: "accentPurple", chart: "accentPurple.5", icon: IconPackage },
  SALARIES: { label: "Salaries", color: "success", chart: "accentPurple.8", icon: IconUsers },
  RENT: { label: "Rent", color: "danger", chart: "danger.7", icon: IconBuildingStore },
  UTILITIES: { label: "Utilities", color: "info", chart: "info.8", icon: IconBolt },
  OTHER: { label: "Other", color: "gray", chart: "gray.5", icon: IconDots },
};

/** Select options in API order. */
export const EXPENSE_CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((category) => ({
  value: category,
  label: EXPENSE_CATEGORY_META[category].label,
}));

export function isExpenseCategory(value: string | null | undefined): value is ExpenseCategory {
  return EXPENSE_CATEGORIES.some((category) => category === value);
}

/** Chart color for a profit `expenseBreakdown` key (`PRODUCT_COST` or a category). */
export function expenseSliceColor(key: string): MantineColor {
  if (isExpenseCategory(key)) {
    return EXPENSE_CATEGORY_META[key].chart;
  }
  return "secondaryGreen.6";
}
