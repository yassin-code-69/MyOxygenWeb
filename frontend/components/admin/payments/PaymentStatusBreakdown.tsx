"use client";

import Link from "next/link";
import { Box, Group, Skeleton, Stack, Text } from "@mantine/core";
import { IconChartBar } from "@tabler/icons-react";
import { EmptyState } from "../../EmptyState";
import { STATUS_CONFIG, StatusBadge } from "../../StatusBadge";
import type { AdminPaymentStatusTotal } from "../../../types/admin-management";
import type { PaymentStatus } from "../../../types/order";
import { MeterBar } from "../MeterBar";
import { formatMoney, formatPercent, pluralize } from "../format";
import classes from "./payments.module.css";

export interface PaymentStatusBreakdownProps {
  rows: readonly AdminPaymentStatusTotal[] | undefined;
  loading: boolean;
  /** Link that filters the table to one status. */
  hrefFor: (status: PaymentStatus) => string;
}

/** Amount and order count per payment status, each bar scaled to its share of the total amount. */
export function PaymentStatusBreakdown({ rows, loading, hrefFor }: PaymentStatusBreakdownProps) {
  if (loading && !rows) {
    return (
      <Stack gap="sm" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <Stack key={index} gap={8} mih={44} justify="center">
            <Group justify="space-between">
              <Skeleton height={18} width={72} radius="xl" />
              <Skeleton height={12} width={120} radius="xl" />
            </Group>
            <Skeleton height={8} radius="xl" />
          </Stack>
        ))}
      </Stack>
    );
  }
  const list = rows ?? [];
  const total = list.reduce((sum, row) => sum + row.amount, 0);
  if (total <= 0) {
    return (
      <EmptyState
        withCard={false}
        size="sm"
        color="secondaryGreen"
        icon={<IconChartBar stroke={1.6} />}
        title="No payments in this period"
        description="Payment totals appear once orders are placed."
      />
    );
  }

  return (
    <Stack component="ul" gap="sm" m={0} p={0} style={{ listStyle: "none" }}>
      {list.map((row) => {
        const share = (row.amount / total) * 100;
        const color = STATUS_CONFIG[row.status].color;
        return (
          <li key={row.status}>
            <Link href={hrefFor(row.status)} className={classes.statusRow} aria-label={`Show ${STATUS_CONFIG[row.status].label.toLowerCase()} orders`}>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Group justify="space-between" gap="xs" wrap="nowrap" mb={6}>
                  <StatusBadge status={row.status} size="sm" style={{ maxWidth: "none" }} />
                  <Text size="sm" c="var(--mo-color-text-secondary)" className={`mo-tabular-nums ${classes.statusLabel}`} style={{ whiteSpace: "nowrap" }}>
                    <Text span size="sm" fw={700} c="var(--mo-color-text)">
                      {formatMoney(row.amount)}
                    </Text>{" "}
                    · {pluralize(row.orders, "order")} · {formatPercent(share, 0)}
                  </Text>
                </Group>
                <MeterBar ratio={share / 100} color={color === "gray" ? "gray.5" : `${color}.6`} />
              </Box>
            </Link>
          </li>
        );
      })}
    </Stack>
  );
}
