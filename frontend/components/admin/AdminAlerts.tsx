"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ActionIcon, Badge, Box, Group, Indicator, Menu, Text } from "@mantine/core";
import { IconAlertTriangle, IconBell, IconChecks, IconClipboardList, IconPackage } from "@tabler/icons-react";
import { useAdminAlertCounts } from "../../hooks/admin/use-telemetry";
import { useCan } from "../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../types/auth";
import { formatCount } from "./format";
import { TONES, type KpiTone } from "./kit/tones";

interface AlertRow {
  key: string;
  label: string;
  description: string;
  count: number;
  icon: ReactNode;
  tone: KpiTone;
  href: string | null;
}

/**
 * Notifications bell driven by real counts: pending orders (any date), low
 * stock and batches expiring within 30 days. Each row only appears when the
 * user may read that number, and links only when they may open the page.
 */
export function AdminAlerts() {
  const counts = useAdminAlertCounts();
  const canProducts = useCan(PERMISSIONS.PRODUCTS_READ);
  const canAnalytics = useCan(PERMISSIONS.ANALYTICS_READ);
  const canBatches = useCan(PERMISSIONS.BATCHES_MANAGE);

  const rows: AlertRow[] = [];
  if (counts.pendingOrders !== null) {
    rows.push({
      key: "pending",
      label: "Pending orders",
      description: "Waiting to be confirmed",
      count: counts.pendingOrders,
      icon: <IconClipboardList size={16} aria-hidden />,
      tone: "peach",
      href: "/admin/orders?status=PENDING",
    });
  }
  if (counts.lowStock !== null) {
    rows.push({
      key: "low-stock",
      label: "Low-stock products",
      description: "At or below their alert level",
      count: counts.lowStock,
      icon: <IconPackage size={16} aria-hidden />,
      tone: "rose",
      href: canProducts ? "/admin/products?stock=low" : canAnalytics ? "/admin/reports/inventory" : null,
    });
  }
  if (counts.expiringSoon !== null) {
    rows.push({
      key: "expiring",
      label: "Expiring batches",
      description: "Stock that expires within 30 days",
      count: counts.expiringSoon,
      icon: <IconAlertTriangle size={16} aria-hidden />,
      tone: "lavender",
      href: canBatches ? "/admin/batches?status=EXPIRING_SOON" : null,
    });
  }

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const summary =
    rows.length === 0
      ? "Notifications"
      : `Notifications: ${rows.map((row) => `${formatCount(row.count)} ${row.label.toLowerCase()}`).join(", ")}`;

  return (
    <Menu position="bottom-end" width={320} withinPortal offset={8}>
      <Indicator
        disabled={total === 0}
        label={total > 99 ? "99+" : formatCount(total)}
        color="primaryPink.8"
        size={18}
        offset={6}
        withBorder
        styles={{ indicator: { fontSize: 10, fontWeight: 700, paddingInline: 4, pointerEvents: "none" } }}
      >
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" size={42} radius="xl" aria-label={summary}>
            <IconBell size={22} stroke={1.8} aria-hidden />
          </ActionIcon>
        </Menu.Target>
      </Indicator>
      <Menu.Dropdown>
        <Group justify="space-between" px="sm" pt="xs" pb={6}>
          <Text size="sm" fw={700}>
            Notifications
          </Text>
          {total > 0 ? (
            <Badge size="sm" variant="light" color="primaryPink" className="mo-tabular-nums">
              {formatCount(total)} new
            </Badge>
          ) : null}
        </Group>
        <Menu.Divider />
        {total === 0 ? (
          <Menu.Item disabled leftSection={<IconChecks size={16} aria-hidden />}>
            You&apos;re all caught up
          </Menu.Item>
        ) : null}
        {rows
          .filter((row) => row.count > 0)
          .map((row) => {
            const tone = TONES[row.tone];
            const content = (
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <Box style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate>
                    {row.label}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {row.description}
                  </Text>
                </Box>
                <Badge variant="light" color={tone.color} className="mo-tabular-nums" style={{ flex: "0 0 auto" }}>
                  {formatCount(row.count)}
                </Badge>
              </Group>
            );
            const icon = (
              <Box
                w={30}
                h={30}
                display="flex"
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--mo-radius-xl)",
                  backgroundColor: tone.iconBg,
                  color: tone.icon,
                }}
              >
                {row.icon}
              </Box>
            );
            return row.href ? (
              <Menu.Item key={row.key} component={Link} href={row.href} leftSection={icon}>
                {content}
              </Menu.Item>
            ) : (
              <Menu.Item key={row.key} leftSection={icon} disabled>
                {content}
              </Menu.Item>
            );
          })}
      </Menu.Dropdown>
    </Menu>
  );
}
