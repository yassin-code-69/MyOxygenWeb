"use client";

import Link from "next/link";
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Container,
  CopyButton,
  Grid,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconInfoCircle,
  IconMapPinSearch,
  IconRefresh,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { StatusBadge } from "../StatusBadge";
import { OrderErrorState } from "./OrderStates";
import { OrderTimeline } from "./OrderTimeline";
import { COURIER_STATUS, formatCourierName, formatDhakaDateTime, ORDER_REF_PATTERN } from "./order-format";
import { useRequireAuth } from "../../hooks/auth/use-auth-ready";
import { useOrderTracking } from "../../hooks/orders/use-orders";
import { semantic } from "../../tokens";
import type { OrderTrackingDTO } from "../../types/order";

function TrackingSkeleton() {
  return (
    <Container size="md" py={{ base: "lg", md: "xl" }} aria-busy="true" aria-label="Loading tracking">
      <Skeleton h={14} w={140} radius="xl" mb="md" />
      <Skeleton h={30} w={300} radius="xl" mb="lg" />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, sm: 5 }}>
          <Paper withBorder radius="md" p="lg" bg={semantic.surface}>
            <Skeleton h={18} w={120} radius="xl" mb="md" />
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} h={12} w={`${88 - row * 10}%`} radius="xl" mb={12} />
            ))}
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 7 }}>
          <Paper withBorder radius="md" p="lg" bg={semantic.surface}>
            <Skeleton h={18} w={140} radius="xl" mb="md" />
            {[0, 1, 2].map((row) => (
              <Group key={row} wrap="nowrap" align="flex-start" mb="md">
                <Skeleton circle h={28} />
                <Stack gap={6} style={{ flex: 1 }}>
                  <Skeleton h={14} w={120} radius="xl" />
                  <Skeleton h={12} w={200} radius="xl" />
                </Stack>
              </Group>
            ))}
          </Paper>
        </Grid.Col>
      </Grid>
    </Container>
  );
}

function CourierCard({ tracking }: { tracking: OrderTrackingDTO }) {
  const { courier, courierError, trackingId, courierProvider, status } = tracking;
  const courierStatus = courier ? COURIER_STATUS[courier.normalizedStatus] ?? COURIER_STATUS.UNKNOWN : null;
  const checkedAt = courier ? formatDhakaDateTime(courier.checkedAt) : null;

  return (
    <Paper withBorder radius="md" p="lg" bg={semantic.surface} h="100%">
      <Group gap={8} mb="md" wrap="nowrap">
        <IconTruckDelivery size={18} color={semantic.iconBrand} aria-hidden />
        <Title order={2} size="h4" c={semantic.text}>
          Courier
        </Title>
      </Group>

      {trackingId ? (
        <Stack gap="md">
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              Delivery partner
            </Text>
            <Text size="sm" fw={600} c={semantic.text}>
              {formatCourierName(courier?.provider ?? courierProvider)}
            </Text>
          </Stack>

          <Stack gap={2}>
            <Text size="xs" c="dimmed" id="tracking-id-label">
              Tracking ID
            </Text>
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={700} ff="monospace" c={semantic.text} aria-labelledby="tracking-id-label" style={{ wordBreak: "break-all" }}>
                {trackingId}
              </Text>
              <CopyButton value={trackingId} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? "Copied" : "Copy tracking ID"} withArrow>
                    <ActionIcon
                      variant="subtle"
                      color={copied ? "success" : "gray"}
                      onClick={copy}
                      aria-label={copied ? "Tracking ID copied" : "Copy tracking ID"}
                    >
                      {copied ? <IconCheck size={16} aria-hidden /> : <IconCopy size={16} aria-hidden />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          </Stack>

          {courier && courierStatus ? (
            <Stack gap={4}>
              <Text size="xs" c="dimmed">
                Courier status
              </Text>
              <Group gap="xs">
                <Badge color={courierStatus.color} variant="light" tt="none" size="md">
                  {courierStatus.label}
                </Badge>
              </Group>
              {checkedAt ? (
                <Text size="xs" c="dimmed">
                  Checked <time dateTime={courier.checkedAt}>{checkedAt}</time>
                </Text>
              ) : null}
            </Stack>
          ) : null}

          {courierError ? (
            <Alert color="warning" variant="light" radius="md" icon={<IconInfoCircle size={18} />}>
              Live updates from the courier aren&apos;t available right now. The order status on this page is still
              up to date — please check again later.
            </Alert>
          ) : null}
        </Stack>
      ) : (
        <Text size="sm" c={semantic.textSecondary}>
          {status === "CANCELLED" || status === "REFUNDED"
            ? "This order was not handed to a courier."
            : "Your parcel hasn't been handed to a courier yet. The tracking ID will appear here once it ships."}
        </Text>
      )}
    </Paper>
  );
}

export interface OrderTrackingViewProps {
  orderNumber: string;
}

/** `/orders/[orderNumber]/track` — status timeline + courier status for one order. */
export function OrderTrackingView({ orderNumber }: OrderTrackingViewProps) {
  const validReference = ORDER_REF_PATTERN.test(orderNumber);
  const encoded = encodeURIComponent(orderNumber);
  const { status } = useRequireAuth(`/orders/${encoded}/track`);
  const { tracking, error, isLoading, isValidating, mutate } = useOrderTracking(
    orderNumber,
    status === "authenticated" && validReference
  );

  if (status !== "authenticated") {
    return <TrackingSkeleton />;
  }
  if (!validReference || (error && !tracking)) {
    return (
      <Container size="sm" py={{ base: "xl", md: 64 }}>
        <Title order={1} size="h2" c={semantic.text} mb="lg">
          Track order
        </Title>
        <OrderErrorState error={error} invalidReference={!validReference} onRetry={() => void mutate()} />
      </Container>
    );
  }
  if (isLoading || !tracking) {
    return <TrackingSkeleton />;
  }

  return (
    <Container size="md" py={{ base: "lg", md: "xl" }}>
      <Anchor
        component={Link}
        href={`/orders/${encoded}`}
        size="sm"
        c={semantic.textBrand}
        mb="md"
        display="inline-block"
      >
        <Group gap={4} wrap="nowrap" component="span">
          <IconArrowLeft size={14} aria-hidden />
          Order details
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap" gap="sm">
        <Stack gap={4}>
          <Title order={1} size="h2" c={semantic.text}>
            Track order
          </Title>
          <Text size="sm" c="dimmed" ff="monospace">
            {tracking.orderNumber}
          </Text>
        </Stack>
        <Group gap="xs">
          <StatusBadge status={tracking.status} size="lg" />
          <Button
            variant="subtle"
            color="primaryPink"
            radius="xl"
            size="sm"
            leftSection={<IconRefresh size={16} aria-hidden />}
            loading={isValidating}
            onClick={() => void mutate()}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, sm: 5 }}>
          <CourierCard tracking={tracking} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 7 }}>
          <Paper withBorder radius="md" p="lg" bg={semantic.surface}>
            <Group gap={8} mb="md" wrap="nowrap">
              <IconMapPinSearch size={18} color={semantic.iconBrand} aria-hidden />
              <Title order={2} size="h4" c={semantic.text}>
                Status history
              </Title>
            </Group>
            <OrderTimeline
              status={tracking.status}
              history={tracking.history}
              shippedAt={tracking.shippedAt}
              deliveredAt={tracking.deliveredAt}
              cancelledAt={tracking.cancelledAt}
            />
          </Paper>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
