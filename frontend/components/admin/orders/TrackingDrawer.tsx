"use client";

import { Alert, Badge, Box, Button, Drawer, Group, Paper, SimpleGrid, Skeleton, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { StatusBadge } from "../../StatusBadge";
import { useAdminOrderTracking } from "../../../hooks/admin/use-admin-orders";
import { PERMISSIONS } from "../../../types/auth";
import { formatDhakaDateTime, humanizeEnum } from "../format";
import { QueryError } from "../QueryError";
import { courierName } from "./order-utils";
import { OrderTimeline } from "./OrderTimeline";

export interface TrackingDrawerProps {
  orderId: string | null;
  onClose: () => void;
}

/** Live courier status + order timeline (`GET /admin/orders/:id/tracking`). */
export function TrackingDrawer({ orderId, onClose }: TrackingDrawerProps) {
  const { data, error, isLoading, isValidating, mutate } = useAdminOrderTracking(orderId);

  return (
    <Drawer opened={orderId !== null} onClose={onClose} position="right" size="md" title={<Text fw={700}>Shipment tracking</Text>}>
      {isLoading && !data ? (
        <Stack gap="md">
          <Skeleton height={24} width="60%" />
          <Skeleton height={120} radius="md" />
          <Skeleton height={200} radius="md" />
        </Stack>
      ) : null}
      {error && !data ? <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.ORDERS_READ} /> : null}
      {data ? (
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text fw={700} ff="var(--mo-font-monospace)">
                {data.orderNumber}
              </Text>
              <StatusBadge status={data.status} />
            </Box>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} aria-hidden />}
              loading={isValidating}
              onClick={() => void mutate()}
            >
              Refresh
            </Button>
          </Group>

          <Paper withBorder radius="md" p="md">
            <SimpleGrid cols={2} spacing="sm">
              <Box>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Courier
                </Text>
                <Text size="sm">{data.courierProvider ? courierName(data.courierProvider) : "Not dispatched"}</Text>
              </Box>
              <Box>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Tracking number
                </Text>
                <Text size="sm" ff="var(--mo-font-monospace)">
                  {data.trackingId ?? "—"}
                </Text>
              </Box>
              <Box>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Shipped
                </Text>
                <Text size="sm">{formatDhakaDateTime(data.shippedAt)}</Text>
              </Box>
              <Box>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  {data.cancelledAt ? "Cancelled" : "Delivered"}
                </Text>
                <Text size="sm">{formatDhakaDateTime(data.cancelledAt ?? data.deliveredAt)}</Text>
              </Box>
            </SimpleGrid>
          </Paper>

          {data.courier ? (
            <Paper withBorder radius="md" p="md">
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={6}>
                Live courier status
              </Text>
              <Group gap="sm">
                <Badge variant="light" color="info" size="lg">
                  {humanizeEnum(data.courier.normalizedStatus)}
                </Badge>
                {data.courier.rawStatus ? (
                  <Text size="sm" c="dimmed">
                    {data.courier.rawStatus}
                  </Text>
                ) : null}
              </Group>
              <Text size="xs" c="dimmed" mt={6}>
                Checked {formatDhakaDateTime(data.courier.checkedAt)}
              </Text>
            </Paper>
          ) : null}

          {data.courierError ? (
            <Alert variant="light" color="warning" radius="md" icon={<IconAlertTriangle size={18} aria-hidden />} title="Live status unavailable">
              {data.courierError}
            </Alert>
          ) : null}

          {!data.trackingId && !data.courierError ? (
            <Text size="sm" c="dimmed">
              This order hasn&apos;t been handed to a courier yet.
            </Text>
          ) : null}

          <Box>
            <Text fw={600} mb="sm">
              Timeline
            </Text>
            <OrderTimeline history={data.history} />
          </Box>
        </Stack>
      ) : null}
    </Drawer>
  );
}
