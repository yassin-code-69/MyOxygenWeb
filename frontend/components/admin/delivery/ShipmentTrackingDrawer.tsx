"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  CopyButton,
  Drawer,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Timeline,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconRefresh,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { STATUS_CONFIG, StatusBadge } from "../../StatusBadge";
import { useShipmentTracking } from "../../../hooks/admin/use-delivery";
import { useCan } from "../../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../../types/auth";
import type { AdminOrderTrackingDTO } from "../../../types/admin";
import { QueryError } from "../QueryError";
import { formatDhakaDateTime, formatDhakaTime, roleLabel } from "../format";
import { cssColor } from "../kit";
import { PARCEL_STATUS, courierLabel, daysBetween, formatDayCount } from "./delivery-utils";

export interface ShipmentTrackingDrawerProps {
  orderId: string | null;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box style={{ minWidth: 0 }}>
      <Text size="xs" c="var(--mo-color-text-muted)" fw={600}>
        {label}
      </Text>
      {children}
    </Box>
  );
}

function TrackingSkeleton() {
  return (
    <Stack gap="lg" aria-hidden>
      <Group justify="space-between">
        <Stack gap={8}>
          <Skeleton height={16} width={200} radius="xl" />
          <Skeleton height={20} width={90} radius="xl" />
        </Stack>
        <Skeleton height={30} width={90} radius="xl" />
      </Group>
      <Skeleton height={132} radius="md" />
      <Skeleton height={96} radius="md" />
      <Stack gap="md">
        {Array.from({ length: 4 }, (_, index) => (
          <Group key={index} gap="sm" wrap="nowrap">
            <Skeleton circle height={24} />
            <Stack gap={6} style={{ flex: 1 }}>
              <Skeleton height={12} width="40%" radius="xl" />
              <Skeleton height={10} width="60%" radius="xl" />
            </Stack>
          </Group>
        ))}
      </Stack>
    </Stack>
  );
}

function TrackingBody({
  data,
  refreshing,
  onRefresh,
  canOpenOrders,
}: {
  data: AdminOrderTrackingDTO;
  refreshing: boolean;
  onRefresh: () => void;
  canOpenOrders: boolean;
}) {
  const parcel = data.courier ? PARCEL_STATUS[data.courier.normalizedStatus] : null;
  const transitDays = data.shippedAt ? daysBetween(data.shippedAt, data.deliveredAt ?? data.cancelledAt ?? new Date()) : null;
  const history = [...data.history].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Box style={{ minWidth: 0 }}>
          <Text fw={700} ff="var(--mo-font-monospace)" size="sm">
            {data.orderNumber}
          </Text>
          <Group gap={6} mt={4}>
            <StatusBadge status={data.status} />
            {transitDays !== null ? (
              <Text size="xs" c="var(--mo-color-text-muted)">
                {data.deliveredAt ? `Delivered in ${formatDayCount(transitDays)}` : data.cancelledAt ? "Cancelled after shipping" : `In transit for ${formatDayCount(transitDays)}`}
              </Text>
            ) : null}
          </Group>
        </Box>
        <Group gap="xs">
          <Tooltip label="Ask the courier again" withArrow>
            <ActionIcon variant="default" radius="xl" size="lg" onClick={onRefresh} loading={refreshing} aria-label="Refresh courier status">
              <IconRefresh size={16} aria-hidden />
            </ActionIcon>
          </Tooltip>
          {canOpenOrders ? (
            <Button
              component={Link}
              href={`/admin/orders?orderId=${encodeURIComponent(data.orderId)}`}
              variant="light"
              color="secondaryGreen"
              radius="xl"
              size="xs"
              rightSection={<IconExternalLink size={14} aria-hidden />}
            >
              Open order
            </Button>
          ) : null}
        </Group>
      </Group>

      <Paper withBorder radius="md" p="md">
        <SimpleGrid cols={2} spacing="md" verticalSpacing="sm">
          <Field label="Courier">
            <Text size="sm">{data.courierProvider ? courierLabel(data.courierProvider) : "Not handed to a courier"}</Text>
          </Field>
          <Field label="Tracking ID">
            {data.trackingId ? (
              <Group gap={4} wrap="nowrap">
                <Text size="sm" ff="var(--mo-font-monospace)" truncate>
                  {data.trackingId}
                </Text>
                <CopyButton value={data.trackingId} timeout={1600}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? "Copied" : "Copy tracking ID"} withArrow>
                      <ActionIcon variant="subtle" color={copied ? "success" : "gray"} size="sm" onClick={copy} aria-label="Copy tracking ID">
                        {copied ? <IconCheck size={14} aria-hidden /> : <IconCopy size={14} aria-hidden />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
            ) : (
              <Text size="sm" c="var(--mo-color-text-subtle)">
                —
              </Text>
            )}
          </Field>
          <Field label="Shipped">
            <Text size="sm">{formatDhakaDateTime(data.shippedAt)}</Text>
          </Field>
          <Field label={data.cancelledAt ? "Cancelled" : "Delivered"}>
            <Text size="sm">{formatDhakaDateTime(data.cancelledAt ?? data.deliveredAt)}</Text>
          </Field>
        </SimpleGrid>
      </Paper>

      {data.courier && parcel ? (
        <Paper withBorder radius="md" p="md">
          <Text size="xs" c="var(--mo-color-text-muted)" fw={600} mb={6}>
            Live courier status
          </Text>
          <Group gap="sm" wrap="wrap">
            <Badge color={parcel.color} variant="light" radius="xl" size="lg" tt="none" fw={600} leftSection={<IconTruckDelivery size={14} aria-hidden />}>
              {parcel.label}
            </Badge>
            {data.courier.rawStatus && data.courier.rawStatus.toLowerCase() !== "unknown" ? (
              <Text size="sm" c="var(--mo-color-text-secondary)">
                Courier says: “{data.courier.rawStatus}”
              </Text>
            ) : null}
          </Group>
          <Text size="xs" c="var(--mo-color-text-muted)" mt={6}>
            Checked at {formatDhakaTime(data.courier.checkedAt)} · {courierLabel(data.courier.provider)}
          </Text>
        </Paper>
      ) : null}

      {data.courierError ? (
        <Alert variant="light" color="warning" radius="md" icon={<IconAlertTriangle size={18} aria-hidden />} title="Couldn't reach the courier">
          {data.courierError} The order timeline below is still up to date.
        </Alert>
      ) : null}

      {!data.trackingId && !data.courierError ? (
        <Text size="sm" c="var(--mo-color-text-muted)">
          This order hasn&apos;t been handed to a courier yet. Dispatch it from the order page once it is packed.
        </Text>
      ) : null}

      <Box>
        <Text component="h3" m={0} mb="sm" fw={600} size="sm" ff="var(--mo-font-heading)">
          Timeline
        </Text>
        {history.length === 0 ? (
          <Text size="sm" c="var(--mo-color-text-muted)">
            No status changes recorded yet.
          </Text>
        ) : (
          <Timeline active={history.length - 1} bulletSize={22} lineWidth={2} color="secondaryGreen">
            {history.map((entry) => {
              const config = STATUS_CONFIG[entry.toStatus];
              return (
                <Timeline.Item
                  key={entry.id}
                  bullet={
                    <ThemeIcon size={22} radius="xl" color={config.color} variant="light" style={{ color: cssColor(`${config.color}.8`) }}>
                      {config.icon}
                    </ThemeIcon>
                  }
                  title={
                    <Text size="sm" fw={600}>
                      {entry.fromStatus ? config.label : "Order placed"}
                    </Text>
                  }
                >
                  <Text size="xs" c="var(--mo-color-text-muted)">
                    {formatDhakaDateTime(entry.createdAt)}
                    {entry.changedBy ? ` · ${entry.changedBy.fullName} (${roleLabel(entry.changedBy.role)})` : ""}
                  </Text>
                  {entry.note && entry.note !== "Order placed" ? (
                    <Text size="sm" c="var(--mo-color-text-secondary)" mt={2}>
                      {entry.note}
                    </Text>
                  ) : null}
                </Timeline.Item>
              );
            })}
          </Timeline>
        )}
      </Box>
    </Stack>
  );
}

/** Shipment tracking (`GET /admin/orders/:id/tracking`): timeline, live courier status and a copyable tracking ID. */
export function ShipmentTrackingDrawer({ orderId, onClose }: ShipmentTrackingDrawerProps) {
  const { data, error, isLoading, isValidating, mutate } = useShipmentTracking(orderId);
  const canOpenOrders = useCan(PERMISSIONS.ORDERS_READ);
  const current = data && data.orderId === orderId ? data : undefined;

  return (
    <Drawer
      opened={orderId !== null}
      onClose={onClose}
      position="right"
      size="md"
      title={<Text fw={700}>Shipment tracking</Text>}
      closeButtonProps={{ "aria-label": "Close shipment tracking" }}
    >
      {isLoading && !current ? <TrackingSkeleton /> : null}
      {error && !current ? <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.ORDERS_READ} title="We couldn't load the tracking" /> : null}
      {current ? <TrackingBody data={current} refreshing={isValidating} onRefresh={() => void mutate()} canOpenOrders={canOpenOrders} /> : null}
    </Drawer>
  );
}
