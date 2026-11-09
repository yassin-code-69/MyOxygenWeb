"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Anchor, Card, Group, Skeleton, Stack, Text, ThemeIcon, type MantineColor } from "@mantine/core";

export interface KpiCardProps {
  label: string;
  /** Pre-formatted value. */
  value: ReactNode;
  icon: ReactNode;
  color?: MantineColor;
  /** Supporting line under the value. */
  hint?: ReactNode;
  /** Badge next to the label (e.g. a trend). Omit when there is no real data. */
  badge?: ReactNode;
  /** Optional drill-down link. */
  href?: string;
  linkLabel?: string;
  loading?: boolean;
}

/** Metric tile: label, headline number, supporting hint. Skeleton keeps the exact footprint. */
export function KpiCard({
  label,
  value,
  icon,
  color = "primaryPink",
  hint,
  badge,
  href,
  linkLabel = "View",
  loading = false,
}: KpiCardProps) {
  return (
    <Card withBorder padding="lg" h="100%">
      <Stack gap="sm" h="100%" justify="space-between">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.05em" }}>
            {label}
          </Text>
          <ThemeIcon size={36} radius="xl" variant="light" color={color} aria-hidden>
            {icon}
          </ThemeIcon>
        </Group>
        {loading ? (
          <Stack gap={8}>
            <Skeleton height={30} width="65%" radius="md" />
            <Skeleton height={12} width="45%" radius="xl" />
          </Stack>
        ) : (
          <Stack gap={6}>
            <Group gap="xs" align="center" wrap="wrap">
              <Text fz={28} fw={700} lh={1.15} ff="var(--mo-font-heading)" className="mo-tabular-nums">
                {value}
              </Text>
              {badge}
            </Group>
            {hint || href ? (
              <Group justify="space-between" gap="xs" wrap="wrap">
                {hint ? (
                  <Text size="xs" c="dimmed">
                    {hint}
                  </Text>
                ) : (
                  <span />
                )}
                {href ? (
                  <Anchor component={Link} href={href} size="xs" fw={600}>
                    {linkLabel}
                  </Anchor>
                ) : null}
              </Group>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
