"use client";

import React from "react";
import { Badge, type MantineColor, type MantineSize, type MantineRadius } from "@mantine/core";

export type OrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export type StockStatus =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "EXPIRING_SOON";

export type PaymentStatus = "UNPAID" | "PAID" | "FAILED";

export type AppStatus = OrderStatus | StockStatus | PaymentStatus | (string & {});

export interface StatusBadgeProps {
  status: AppStatus;
  label?: string;
  size?: MantineSize;
  variant?: "light" | "filled" | "outline" | "dot";
  radius?: MantineRadius;
  className?: string;
  style?: React.CSSProperties;
}

interface StatusConfig {
  color: MantineColor;
  defaultLabel: string;
}

const statusMap: Record<string, StatusConfig> = {
  // Order statuses
  PENDING: { color: "yellow", defaultLabel: "Pending" },
  PROCESSING: { color: "blue", defaultLabel: "Processing" },
  SHIPPED: { color: "cyan", defaultLabel: "Shipped" },
  DELIVERED: { color: "green", defaultLabel: "Delivered" },
  CANCELLED: { color: "red", defaultLabel: "Cancelled" },
  REFUNDED: { color: "gray", defaultLabel: "Refunded" },

  // Stock & Batch statuses
  IN_STOCK: { color: "green", defaultLabel: "In Stock" },
  LOW_STOCK: { color: "orange", defaultLabel: "Low Stock" },
  OUT_OF_STOCK: { color: "red", defaultLabel: "Out of Stock" },
  EXPIRING_SOON: { color: "orange", defaultLabel: "Expiring Soon" },

  // Payment statuses
  PAID: { color: "green", defaultLabel: "Paid" },
  UNPAID: { color: "yellow", defaultLabel: "Unpaid" },
  FAILED: { color: "red", defaultLabel: "Failed" },
};

export function StatusBadge({
  status,
  label,
  size = "sm",
  variant = "light",
  radius = "xl",
  className,
  style,
}: StatusBadgeProps) {
  const normalizedKey = status.toUpperCase();
  const config = statusMap[normalizedKey] || {
    color: "gray",
    defaultLabel: status.replace(/_/g, " "),
  };

  return (
    <Badge
      color={config.color}
      variant={variant}
      size={size}
      radius={radius}
      className={className}
      style={{
        textTransform: "capitalize",
        fontWeight: 650,
        ...style,
      }}
    >
      {label || config.defaultLabel}
    </Badge>
  );
}
