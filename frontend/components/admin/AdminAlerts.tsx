"use client";

import Link from "next/link";
import { ActionIcon, Badge, Group, Indicator, Menu, Text } from "@mantine/core";
import { IconAlertTriangle, IconBell, IconClock, IconPackage } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useTelemetry } from "../../hooks/admin/use-telemetry";
import { useCan } from "../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../types/auth";
import { formatCount } from "./format";

interface AlertRow {
  key: string;
  label: string;
  count: number;
  icon: ReactNode;
  color: string;
  href: string | null;
}

/**
 * Header alerts driven by real telemetry (pending orders, low stock, expiring
 * batches). Rendered only for users with ANALYTICS_READ; links appear only
 * when the user can open the target page.
 */
export function AdminAlerts() {
  const { data, allowed } = useTelemetry();
  const canOrders = useCan(PERMISSIONS.ORDERS_READ);
  const canProducts = useCan(PERMISSIONS.PRODUCTS_READ);
  const canBatches = useCan(PERMISSIONS.BATCHES_MANAGE);

  if (!allowed || !data) {
    return null;
  }

  const rows: AlertRow[] = [
    {
      key: "pending",
      label: "Pending orders",
      count: data.ordersByStatus.PENDING ?? 0,
      icon: <IconClock size={16} aria-hidden />,
      color: "warning",
      href: canOrders ? "/admin/orders?status=PENDING" : null,
    },
    {
      key: "low-stock",
      label: "Low-stock products",
      count: data.lowStockCount,
      icon: <IconPackage size={16} aria-hidden />,
      color: "warning",
      href: canProducts ? "/admin/products?stock=low" : null,
    },
    {
      key: "expiring",
      label: "Batches expiring within 30 days",
      count: data.expiringSoonCount,
      icon: <IconAlertTriangle size={16} aria-hidden />,
      color: "danger",
      href: canBatches ? "/admin/batches?status=EXPIRING_SOON" : null,
    },
  ];
  const hasAlerts = rows.some((row) => row.count > 0);
  const summary = rows.map((row) => `${formatCount(row.count)} ${row.label.toLowerCase()}`).join(", ");

  return (
    <Menu position="bottom-end" width={300} withinPortal>
      <Indicator disabled={!hasAlerts} color="danger" size={9} offset={7} withBorder>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label={`Store alerts: ${summary}`}>
            <IconBell size={20} aria-hidden />
          </ActionIcon>
        </Menu.Target>
      </Indicator>
      <Menu.Dropdown>
        <Menu.Label>Needs attention</Menu.Label>
        {rows.map((row) => {
          const content = (
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <Text size="sm">{row.label}</Text>
              <Badge variant="light" color={row.count > 0 ? row.color : "gray"} className="mo-tabular-nums">
                {formatCount(row.count)}
              </Badge>
            </Group>
          );
          return row.href ? (
            <Menu.Item key={row.key} component={Link} href={row.href} leftSection={row.icon}>
              {content}
            </Menu.Item>
          ) : (
            <Menu.Item key={row.key} leftSection={row.icon} disabled>
              {content}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
