"use client";

import { Box, Group, Skeleton, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconTruck, IconTruckDelivery } from "@tabler/icons-react";
import { EmptyState } from "../../EmptyState";
import type { AdminCourierDelivery } from "../../../types/admin-management";
import { MeterBar } from "../MeterBar";
import { formatCount, formatPercent } from "../format";
import { paletteColor } from "../kit";
import { courierLabel } from "./delivery-utils";

export interface CourierBreakdownProps {
  couriers: readonly AdminCourierDelivery[] | undefined;
  loading: boolean;
}

/**
 * Per-courier load: parcels in transit right now and deliveries in the
 * period, with each courier's share of the period's deliveries.
 */
export function CourierBreakdown({ couriers, loading }: CourierBreakdownProps) {
  if (loading && !couriers) {
    return (
      <Stack gap="md" aria-hidden>
        {Array.from({ length: 2 }, (_, index) => (
          <Group key={index} gap="sm" wrap="nowrap" mih={52}>
            <Skeleton circle height={36} />
            <Stack gap={8} style={{ flex: 1 }}>
              <Group justify="space-between">
                <Skeleton height={12} width={120} radius="xl" />
                <Skeleton height={12} width={150} radius="xl" />
              </Group>
              <Skeleton height={8} radius="xl" />
            </Stack>
          </Group>
        ))}
      </Stack>
    );
  }

  const rows = couriers ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        withCard={false}
        size="sm"
        color="secondaryGreen"
        icon={<IconTruckDelivery stroke={1.6} />}
        title="No shipments in this period"
        description="Couriers appear here once orders are shipped."
      />
    );
  }

  const delivered = rows.reduce((sum, row) => sum + row.delivered, 0);
  return (
    <Stack component="ul" gap="md" m={0} p={0} style={{ listStyle: "none" }}>
      {rows.map((row, index) => {
        const share = delivered > 0 ? (row.delivered / delivered) * 100 : 0;
        const color = paletteColor(index);
        return (
          <Group component="li" key={row.provider} gap="sm" wrap="nowrap" align="center" mih={52}>
            <ThemeIcon size={36} radius="xl" variant="light" color={color.split(".")[0]} aria-hidden>
              <IconTruck size={18} />
            </ThemeIcon>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Group justify="space-between" gap="xs" wrap="wrap" mb={6}>
                <Text size="sm" fw={600} c="var(--mo-color-text)" truncate>
                  {courierLabel(row.provider)}
                </Text>
                <Text size="xs" c="var(--mo-color-text-secondary)" className="mo-tabular-nums">
                  <Text span size="xs" fw={700} c="var(--mo-color-text)">
                    {formatCount(row.inTransit)}
                  </Text>{" "}
                  in transit ·{" "}
                  <Text span size="xs" fw={700} c="var(--mo-color-text)">
                    {formatCount(row.delivered)}
                  </Text>{" "}
                  delivered ({formatPercent(share, 0)})
                </Text>
              </Group>
              <MeterBar ratio={share / 100} color={color} />
            </Box>
          </Group>
        );
      })}
    </Stack>
  );
}
