import type { CSSProperties, ReactNode } from "react";
import { Badge, type BadgeVariant, type MantineColor, type MantineSize } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconLoader2,
  IconPackage,
  IconReceiptRefund,
  IconTruckDelivery,
} from "@tabler/icons-react";
import type { OrderStatus, PaymentStatus } from "../types/order";
import type { BatchHealthStatus } from "../types/admin";

export type { OrderStatus, PaymentStatus, BatchHealthStatus };

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "EXPIRING_SOON";

/** Every status the badge understands (unknown strings fall back to neutral gray). */
export type KnownStatus = OrderStatus | PaymentStatus | StockStatus | BatchHealthStatus;

export type AppStatus = KnownStatus | (string & {});

interface StatusConfig {
  color: MantineColor;
  label: string;
  icon: ReactNode;
}

const ICON_SIZE = 12;

/** Single source for status → color/label/icon (exported for tables, filters and legends). */
export const STATUS_CONFIG: Record<KnownStatus, StatusConfig> = {
  // Orders
  PENDING: { color: "warning", label: "Pending", icon: <IconClock size={ICON_SIZE} aria-hidden /> },
  PROCESSING: { color: "info", label: "Processing", icon: <IconLoader2 size={ICON_SIZE} aria-hidden /> },
  SHIPPED: { color: "accentPurple", label: "Shipped", icon: <IconTruckDelivery size={ICON_SIZE} aria-hidden /> },
  DELIVERED: { color: "success", label: "Delivered", icon: <IconCircleCheck size={ICON_SIZE} aria-hidden /> },
  CANCELLED: { color: "danger", label: "Cancelled", icon: <IconCircleX size={ICON_SIZE} aria-hidden /> },
  REFUNDED: { color: "gray", label: "Refunded", icon: <IconReceiptRefund size={ICON_SIZE} aria-hidden /> },

  // Payments (REFUNDED shared with orders)
  UNPAID: { color: "warning", label: "Unpaid", icon: <IconClock size={ICON_SIZE} aria-hidden /> },
  PAID: { color: "success", label: "Paid", icon: <IconCircleCheck size={ICON_SIZE} aria-hidden /> },
  FAILED: { color: "danger", label: "Failed", icon: <IconCircleX size={ICON_SIZE} aria-hidden /> },

  // Stock
  IN_STOCK: { color: "success", label: "In stock", icon: <IconPackage size={ICON_SIZE} aria-hidden /> },
  LOW_STOCK: { color: "warning", label: "Low stock", icon: <IconAlertTriangle size={ICON_SIZE} aria-hidden /> },
  OUT_OF_STOCK: { color: "danger", label: "Out of stock", icon: <IconCircleX size={ICON_SIZE} aria-hidden /> },

  // Batch health (FEFO shelf-life)
  EXPIRING_SOON: { color: "warning", label: "Expiring soon", icon: <IconAlertTriangle size={ICON_SIZE} aria-hidden /> },
  EXPIRED: { color: "danger", label: "Expired", icon: <IconCircleX size={ICON_SIZE} aria-hidden /> },
  HEALTHY: { color: "success", label: "Healthy", icon: <IconCircleCheck size={ICON_SIZE} aria-hidden /> },
};

function isKnownStatus(value: string): value is KnownStatus {
  return Object.hasOwn(STATUS_CONFIG, value);
}

/** Resolve config for any status string (case-insensitive). */
export function getStatusConfig(status: string): StatusConfig {
  const key = status.trim().toUpperCase();
  if (isKnownStatus(key)) {
    return STATUS_CONFIG[key];
  }
  const label = key.replace(/_/g, " ").toLowerCase();
  return {
    color: "gray",
    label: label.charAt(0).toUpperCase() + label.slice(1),
    icon: null,
  };
}

export interface StatusBadgeProps {
  status: AppStatus;
  /** Override the default label. */
  label?: string;
  size?: MantineSize;
  /** `light` (default) keeps text at AA contrast on every status color. */
  variant?: Extract<BadgeVariant, "light" | "filled" | "outline" | "dot">;
  /** Show the status icon. Default `true` (color is never the only signal). */
  withIcon?: boolean;
  radius?: MantineSize;
  className?: string;
  style?: CSSProperties;
}

/**
 * Pill badge for order, payment, stock and batch-health statuses.
 *
 * ```tsx
 * <StatusBadge status={order.status} />
 * <StatusBadge status={batch.healthStatus ?? "HEALTHY"} size="xs" />
 * ```
 */
export function StatusBadge({
  status,
  label,
  size = "sm",
  variant = "light",
  withIcon = true,
  radius = "xl",
  className,
  style,
}: StatusBadgeProps) {
  const config = getStatusConfig(status);

  return (
    <Badge
      color={config.color}
      variant={variant}
      size={size}
      radius={radius}
      tt="none"
      fw={600}
      leftSection={withIcon && variant !== "dot" ? config.icon : undefined}
      className={className}
      style={style}
    >
      {label ?? config.label}
    </Badge>
  );
}
