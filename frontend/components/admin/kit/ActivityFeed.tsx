"use client";

import Link from "next/link";
import { Box, Group, Skeleton, Text } from "@mantine/core";
import {
  IconActivity,
  IconCash,
  IconDiscount,
  IconPackageImport,
  IconRefresh,
  IconShoppingCart,
  IconTrash,
  IconUserPlus,
  type Icon,
} from "@tabler/icons-react";
import type { AdminActivityItem, AdminActivityType } from "../../../types/admin-dashboard";
import { EmptyState } from "../../EmptyState";
import { formatDhakaDateTime, formatRelativeTimeShort } from "../format";
import { TONES, type KpiTone } from "./tones";
import { useNow } from "./use-now";
import classes from "./kit.module.css";

const ACTIVITY_META: Record<AdminActivityType, { icon: Icon; tone: KpiTone; label: string }> = {
  ORDER_PLACED: { icon: IconShoppingCart, tone: "mint", label: "New order" },
  ORDER_STATUS_CHANGED: { icon: IconRefresh, tone: "sky", label: "Order updated" },
  PAYMENT_RECEIVED: { icon: IconCash, tone: "mint", label: "Payment" },
  CUSTOMER_REGISTERED: { icon: IconUserPlus, tone: "lavender", label: "New customer" },
  STOCK_IMPORTED: { icon: IconPackageImport, tone: "sky", label: "Stock imported" },
  STOCK_SCRAPPED: { icon: IconTrash, tone: "rose", label: "Stock scrapped" },
  DISCOUNT_CREATED: { icon: IconDiscount, tone: "peach", label: "Discount" },
};

export interface ActivityFeedProps {
  /** `undefined` while loading. */
  items: readonly AdminActivityItem[] | undefined;
  loading?: boolean;
  /** Skeleton rows while loading. Default 5. */
  skeletonCount?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * Timeline of real store events (mockup "Recent Activity"): icon per event
 * type, title, description, relative time (refreshes every minute). Items
 * with an `href` link to the admin page.
 *
 * ```tsx
 * const { data, isLoading } = useAdminActivity(5);
 * <ActivityFeed items={data} loading={isLoading} />
 * ```
 */
export function ActivityFeed({
  items,
  loading = false,
  skeletonCount = 5,
  emptyTitle = "No activity yet",
  emptyDescription = "Orders, sign-ups and stock moves appear here as they happen.",
}: ActivityFeedProps) {
  const now = useNow(60_000);

  if (loading && !items) {
    return (
      <Box aria-hidden>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <Group key={index} gap="sm" wrap="nowrap" className={classes.listRow}>
            <Skeleton circle height={32} />
            <Box style={{ flex: 1 }}>
              <Skeleton height={12} width="70%" radius="xl" />
              <Skeleton height={10} width="45%" radius="xl" mt={8} />
            </Box>
            <Skeleton height={10} width={44} radius="xl" />
          </Group>
        ))}
      </Box>
    );
  }
  if (!items || items.length === 0) {
    return <EmptyState withCard={false} size="sm" icon={<IconActivity stroke={1.6} />} color="secondaryGreen" title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <Box component="ul" className={classes.list}>
      {items.map((item) => {
        const meta = ACTIVITY_META[item.type] ?? { icon: IconActivity, tone: "mint" as const, label: "Activity" };
        const tone = TONES[meta.tone];
        const ItemIcon = meta.icon;
        return (
          <li key={item.id} className={classes.listRow}>
            <Box
              w={32}
              h={32}
              display="flex"
              style={{
                flex: "0 0 auto",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--mo-radius-xl)",
                backgroundColor: tone.iconBg,
                color: tone.icon,
              }}
              aria-hidden
            >
              <ItemIcon size={16} stroke={2} />
            </Box>
            <Box style={{ flex: "1 1 auto", minWidth: 0 }}>
              {item.href ? (
                <Text component={Link} href={item.href} size="sm" fw={600} lineClamp={1} className={classes.cellLink}>
                  {item.title}
                </Text>
              ) : (
                <Text size="sm" fw={600} c="var(--mo-color-text)" lineClamp={1}>
                  {item.title}
                </Text>
              )}
              {item.description ? (
                <Text size="xs" c="var(--mo-color-text-muted)" lineClamp={1}>
                  {item.description}
                </Text>
              ) : null}
            </Box>
            <Text component="time" dateTime={item.at} title={formatDhakaDateTime(item.at)} size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}>
              {formatRelativeTimeShort(item.at, now)}
            </Text>
          </li>
        );
      })}
    </Box>
  );
}
