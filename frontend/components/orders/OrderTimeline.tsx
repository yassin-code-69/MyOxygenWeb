"use client";

import type { ReactNode } from "react";
import { Text, Timeline } from "@mantine/core";
import {
  IconCircleX,
  IconHomeCheck,
  IconPackage,
  IconReceipt,
  IconReceiptRefund,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { semantic } from "../../tokens";
import type { OrderStatus, OrderStatusHistoryEntryDTO } from "../../types/order";
import { formatDhakaDateTime, FULFILMENT_FLOW, ORDER_STATUS_COPY } from "./order-format";

const ICONS: Record<OrderStatus, ReactNode> = {
  PENDING: <IconReceipt size={14} aria-hidden />,
  PROCESSING: <IconPackage size={14} aria-hidden />,
  SHIPPED: <IconTruckDelivery size={14} aria-hidden />,
  DELIVERED: <IconHomeCheck size={14} aria-hidden />,
  CANCELLED: <IconCircleX size={14} aria-hidden />,
  REFUNDED: <IconReceiptRefund size={14} aria-hidden />,
};

interface TimelineEntry {
  key: string;
  status: OrderStatus;
  at: string | null;
  note: string | null;
  upcoming: boolean;
}

export interface OrderTimelineProps {
  status: OrderStatus;
  history: readonly OrderStatusHistoryEntryDTO[];
  /** When the order was placed (used if the history has no PENDING entry). */
  placedAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
}

function timestampFor(status: OrderStatus, props: OrderTimelineProps): string | null {
  switch (status) {
    case "PENDING":
      return props.placedAt ?? null;
    case "SHIPPED":
      return props.shippedAt ?? null;
    case "DELIVERED":
      return props.deliveredAt ?? null;
    case "CANCELLED":
      return props.cancelledAt ?? null;
    default:
      return null;
  }
}

/**
 * Builds the timeline from the real status history. Orders created before the
 * history table existed fall back to the order's own timestamps; the remaining
 * steps of the normal fulfilment path are listed as "up next".
 */
export function buildTimeline(props: OrderTimelineProps): TimelineEntry[] {
  const entries: TimelineEntry[] = [...props.history]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map((entry) => ({ key: entry.id, status: entry.toStatus, at: entry.createdAt, note: entry.note, upcoming: false }));

  if (!entries.some((entry) => entry.status === "PENDING")) {
    entries.unshift({ key: "placed", status: "PENDING", at: props.placedAt ?? null, note: null, upcoming: false });
  }
  const last = entries[entries.length - 1];
  if (last && last.status !== props.status) {
    entries.push({ key: "current", status: props.status, at: timestampFor(props.status, props), note: null, upcoming: false });
  }

  const position = FULFILMENT_FLOW.indexOf(props.status);
  if (position >= 0) {
    for (const next of FULFILMENT_FLOW.slice(position + 1)) {
      entries.push({ key: `next-${next}`, status: next, at: null, note: null, upcoming: true });
    }
  }
  return entries;
}

/** Vertical status timeline (history first, then the upcoming steps dimmed). */
export function OrderTimeline(props: OrderTimelineProps) {
  const entries = buildTimeline(props);
  const active = entries.filter((entry) => !entry.upcoming).length - 1;

  return (
    <Timeline active={active} bulletSize={28} lineWidth={2} color="primaryPink" aria-label="Order status history">
      {entries.map((entry) => {
        const copy = ORDER_STATUS_COPY[entry.status];
        const time = formatDhakaDateTime(entry.at);
        const negative = entry.status === "CANCELLED" || entry.status === "REFUNDED";
        return (
          <Timeline.Item
            key={entry.key}
            bullet={ICONS[entry.status]}
            color={negative ? "danger" : "primaryPink"}
            title={
              <Text fw={600} size="sm" c={entry.upcoming ? semantic.textMuted : semantic.text}>
                {copy.title}
              </Text>
            }
          >
            {entry.upcoming ? (
              <Text size="xs" c="dimmed">
                Up next
              </Text>
            ) : (
              <>
                <Text size="sm" c={semantic.textSecondary}>
                  {copy.description}
                </Text>
                {entry.note && entry.note.trim().toLowerCase() !== copy.title.toLowerCase() ? (
                  <Text size="sm" c={semantic.textSecondary} mt={2}>
                    Note: {entry.note}
                  </Text>
                ) : null}
                <Text size="xs" c="dimmed" mt={4}>
                  {time && entry.at ? <time dateTime={entry.at}>{time}</time> : "Time not recorded"}
                </Text>
              </>
            )}
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
}
