"use client";

import { Badge, Box, Group, Text, UnstyledButton } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconClock } from "@tabler/icons-react";
import type { AdminProductIndex } from "../../../hooks/admin/use-admin-products";
import { formatCount } from "../format";
import { Thumb } from "../kit";

/** `in 12 days`, `tomorrow`, `today`, `3 days ago`. */
export function relativeExpiry(days: number): string {
  if (days > 1) {
    return `in ${formatCount(days)} days`;
  }
  if (days === 1) {
    return "tomorrow";
  }
  if (days === 0) {
    return "today";
  }
  const ago = Math.abs(days);
  return `${formatCount(ago)} ${ago === 1 ? "day" : "days"} ago`;
}

/**
 * Days-to-expiry pill: expired → red, ≤ 7 days → red, ≤ 30 days → orange,
 * later → green. The icon and the words carry the meaning too (not color alone).
 */
export function DaysLeftBadge({ days }: { days: number }) {
  if (days <= 0) {
    return (
      <Badge
        color="danger"
        variant="light"
        radius="xl"
        tt="none"
        fw={700}
        leftSection={<IconCircleX size={12} aria-hidden />}
        className="mo-tabular-nums"
        style={{ maxWidth: "none" }}
      >
        {days === 0 ? "Expired today" : `Expired ${relativeExpiry(days)}`}
      </Badge>
    );
  }
  const urgent = days <= 7;
  const soon = days <= 30;
  return (
    <Badge
      color={urgent ? "danger" : soon ? "warning" : "success"}
      variant="light"
      radius="xl"
      tt="none"
      fw={700}
      leftSection={urgent ? <IconAlertTriangle size={12} aria-hidden /> : soon ? <IconClock size={12} aria-hidden /> : <IconCircleCheck size={12} aria-hidden />}
      className="mo-tabular-nums"
      style={{ maxWidth: "none" }}
    >
      {days === 1 ? "1 day left" : `${formatCount(days)} days left`}
    </Badge>
  );
}

export interface BatchProductCellProps {
  productId: string;
  title: string;
  sku: string;
  index: AdminProductIndex | undefined;
  /** Makes the title a button (opens the product). */
  onOpen?: () => void;
}

/** Product thumbnail (from the catalog index) + title + SKU for batch-based tables. */
export function BatchProductCell({ productId, title, sku, index, onOpen }: BatchProductCellProps) {
  const entry = index?.byId.get(productId);
  const name = (
    <Text size="sm" fw={600} lineClamp={1} c="var(--mo-color-text)">
      {title}
    </Text>
  );
  return (
    <Group gap="sm" wrap="nowrap" miw={200}>
      <Thumb src={entry?.image} size={40} />
      <Box style={{ minWidth: 0 }}>
        {onOpen ? (
          <UnstyledButton onClick={onOpen} aria-label={`Open ${title}`}>
            {name}
          </UnstyledButton>
        ) : (
          name
        )}
        <Text size="xs" c="var(--mo-color-text-muted)" ff="var(--mo-font-monospace)">
          {sku}
        </Text>
      </Box>
    </Group>
  );
}
