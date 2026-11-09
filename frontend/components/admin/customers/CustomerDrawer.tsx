"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Anchor,
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
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconClipboardList,
  IconCopy,
  IconMail,
  IconMapPin,
  IconPhone,
  IconUserCheck,
  IconUserOff,
} from "@tabler/icons-react";
import { EmptyState } from "../../EmptyState";
import { StatusBadge } from "../../StatusBadge";
import { useCustomerDetail, useCustomerMutations } from "../../../hooks/admin/use-customers";
import { useCan } from "../../../hooks/admin/use-permission";
import { getErrorMessage } from "../../../lib/api-client";
import { formatBangladeshMobile } from "../../../lib/phone";
import { PERMISSIONS } from "../../../types/auth";
import type { AdminCustomerDetail } from "../../../types/admin-management";
import type { ShippingAddress } from "../../../types/order";
import { ConfirmModal } from "../ConfirmModal";
import { QueryError } from "../QueryError";
import { formatCount, formatDhakaDate, formatDhakaTime, formatMoney, pluralize } from "../format";
import { Thumb, TONES, type KpiTone } from "../kit";
import { ActiveBadge } from "./ActiveBadge";
import { CustomerAvatar } from "./CustomerAvatar";
import classes from "./customers.module.css";

export interface CustomerDrawerProps {
  customerId: string | null;
  onClose: () => void;
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
      <Text component="h3" fw={600} size="sm" c="var(--mo-color-text)" ff="var(--mo-font-heading)" m={0}>
        {children}
      </Text>
      {action}
    </Group>
  );
}

function StatTile({ tone, label, value, caption }: { tone: KpiTone; label: string; value: ReactNode; caption?: ReactNode }) {
  const palette = TONES[tone];
  const vars = { "--tile-surface": palette.surface, "--tile-border": palette.border } as CSSProperties;
  return (
    <Box className={classes.statTile} style={vars}>
      <Text size="xs" c="var(--mo-color-text-muted-on-tint)" fw={500}>
        {label}
      </Text>
      <Text fz={20} fw={600} ff="var(--mo-font-heading)" c="var(--mo-color-text)" className="mo-tabular-nums" lh={1.4} truncate>
        {value}
      </Text>
      <Text size="xs" c="var(--mo-color-text-muted-on-tint)" mih={18} truncate>
        {caption}
      </Text>
    </Box>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  return (
    <CopyButton value={value} timeout={1600}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copied" : `Copy ${label}`} withArrow position="left">
          <ActionIcon variant="subtle" color={copied ? "success" : "gray"} size="sm" onClick={copy} aria-label={`Copy ${label}`}>
            {copied ? <IconCheck size={14} aria-hidden /> : <IconCopy size={14} aria-hidden />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

function AddressCard({ address, primary }: { address: ShippingAddress; primary: boolean }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Box c="var(--mo-color-secondary-8)" mt={2} aria-hidden>
          <IconMapPin size={18} />
        </Box>
        <Box style={{ minWidth: 0 }}>
          <Group gap={6}>
            <Text size="sm" fw={600}>
              {address.fullName}
            </Text>
            {primary ? (
              <Text size="xs" c="var(--mo-color-text-muted)">
                · most recent
              </Text>
            ) : null}
          </Group>
          <Text size="sm" c="var(--mo-color-text-secondary)">
            {address.addressLine1}
            {address.addressLine2 ? `, ${address.addressLine2}` : ""}
          </Text>
          <Text size="sm" c="var(--mo-color-text-secondary)">
            {address.city}, {address.district} {address.postalCode}
          </Text>
          <Text size="xs" c="var(--mo-color-text-muted)" className="mo-tabular-nums">
            {formatBangladeshMobile(address.phone)}
          </Text>
        </Box>
      </Group>
    </Paper>
  );
}

function DrawerSkeleton() {
  return (
    <Stack gap="lg" aria-hidden>
      <Group gap="md" wrap="nowrap">
        <Skeleton circle height={56} />
        <Stack gap={8} style={{ flex: 1 }}>
          <Skeleton height={18} width="55%" radius="xl" />
          <Skeleton height={12} width="35%" radius="xl" />
        </Stack>
      </Group>
      <Stack gap={10}>
        <Skeleton height={14} width="60%" radius="xl" />
        <Skeleton height={14} width="70%" radius="xl" />
      </Stack>
      <SimpleGrid cols={2} spacing="sm">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} height={82} radius="md" />
        ))}
      </SimpleGrid>
      <Stack gap={0}>
        <Skeleton height={14} width={120} radius="xl" mb="sm" />
        {Array.from({ length: 4 }, (_, index) => (
          <Group key={index} gap="sm" h={60} wrap="nowrap">
            <Skeleton height={40} width={40} radius="sm" />
            <Stack gap={6} style={{ flex: 1 }}>
              <Skeleton height={10} width="50%" radius="xl" />
              <Skeleton height={10} width="35%" radius="xl" />
            </Stack>
            <Skeleton height={20} width={72} radius="xl" />
          </Group>
        ))}
      </Stack>
    </Stack>
  );
}

function CustomerDetailBody({ detail, canOpenOrders }: { detail: AdminCustomerDetail; canOpenOrders: boolean }) {
  const { customer, stats, recentOrders, addresses } = detail;
  return (
    <Stack gap="lg">
      <Group gap="md" wrap="nowrap" align="center">
        <CustomerAvatar name={customer.fullName} seed={customer.id} size={56} />
        <Box style={{ minWidth: 0 }}>
          <Group gap="xs" wrap="wrap">
            <Title order={3} fz={18} fw={600} c="var(--mo-color-text)">
              {customer.fullName}
            </Title>
            <ActiveBadge active={customer.isActive} size="sm" />
          </Group>
          <Text size="sm" c="var(--mo-color-text-muted)">
            Customer since {formatDhakaDate(customer.createdAt)}
          </Text>
        </Box>
      </Group>

      <Stack gap={6}>
        <Group gap="xs" wrap="nowrap">
          <Box component="span" display="inline-flex" c="var(--mo-color-icon)" aria-hidden>
            <IconPhone size={16} />
          </Box>
          <Anchor href={`tel:${customer.phone}`} size="sm" c="var(--mo-color-text)" className="mo-tabular-nums">
            {formatBangladeshMobile(customer.phone)}
          </Anchor>
          <CopyValue value={customer.phone} label="phone number" />
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Box component="span" display="inline-flex" c="var(--mo-color-icon)" aria-hidden>
            <IconMail size={16} />
          </Box>
          {customer.email ? (
            <>
              <Anchor href={`mailto:${customer.email}`} size="sm" c="var(--mo-color-text)" truncate>
                {customer.email}
              </Anchor>
              <CopyValue value={customer.email} label="email address" />
            </>
          ) : (
            <Text size="sm" c="var(--mo-color-text-subtle)">
              No email on file
            </Text>
          )}
        </Group>
      </Stack>

      <SimpleGrid cols={2} spacing="sm">
        <StatTile tone="lavender" label="Orders" value={formatCount(stats.ordersCount)} caption={stats.firstOrderAt ? `First on ${formatDhakaDate(stats.firstOrderAt)}` : "No orders yet"} />
        <StatTile tone="mint" label="Total spent" value={formatMoney(stats.totalSpent)} caption="Excludes cancelled & refunded" />
        <StatTile tone="sky" label="Avg order value" value={formatMoney(stats.avgOrderValue)} caption="Per paid-for order" />
        <StatTile tone="peach" label="Last order" value={stats.lastOrderAt ? formatDhakaDate(stats.lastOrderAt) : "—"} caption={stats.lastOrderAt ? `at ${formatDhakaTime(stats.lastOrderAt)}` : undefined} />
      </SimpleGrid>

      <Box>
        <SectionTitle
          action={
            canOpenOrders && recentOrders.length > 0 ? (
              <Anchor component={Link} href={`/admin/orders?q=${encodeURIComponent(customer.phone)}`} size="xs" fw={600} c="var(--mo-color-secondary-8)">
                All orders
              </Anchor>
            ) : null
          }
        >
          Recent orders
        </SectionTitle>
        {recentOrders.length === 0 ? (
          <EmptyState
            withCard
            size="sm"
            color="secondaryGreen"
            icon={<IconClipboardList stroke={1.6} />}
            title="No orders yet"
            description="Orders this customer places will show up here."
          />
        ) : (
          <Box component="ul" m={0} p={0} style={{ listStyle: "none" }}>
            {recentOrders.map((order) => (
              <li key={order.id} className={classes.orderRow}>
                <Thumb src={order.items[0]?.productImage} size={40} />
                <Box style={{ flex: 1, minWidth: 0 }}>
                  {canOpenOrders ? (
                    <Link href={`/admin/orders?orderId=${encodeURIComponent(order.id)}`} className={classes.orderLink} aria-label={`Open order ${order.orderNumber}`}>
                      {order.orderNumber}
                    </Link>
                  ) : (
                    <Text span className={classes.orderLink}>
                      {order.orderNumber}
                    </Text>
                  )}
                  <Text size="xs" c="var(--mo-color-text-muted)">
                    {formatDhakaDate(order.createdAt)} · {pluralize(order.itemCount, "item")}
                  </Text>
                </Box>
                <Stack gap={4} align="flex-end">
                  <Text size="sm" fw={600} className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
                    {formatMoney(order.total)}
                  </Text>
                  <StatusBadge status={order.status} size="xs" withIcon={false} />
                </Stack>
              </li>
            ))}
          </Box>
        )}
      </Box>

      <Box>
        <SectionTitle>Saved addresses</SectionTitle>
        {addresses.length === 0 ? (
          <Text size="sm" c="var(--mo-color-text-muted)">
            No delivery addresses yet — they are saved from the customer&apos;s orders.
          </Text>
        ) : (
          <Stack gap="xs">
            {addresses.map((address, index) => (
              <AddressCard key={`${address.addressLine1}-${address.postalCode}-${index}`} address={address} primary={index === 0} />
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}

/**
 * Customer detail drawer (`GET /admin/customers/:id`): profile, spend stats,
 * the 10 most recent orders (→ `/admin/orders?orderId=`), saved addresses,
 * and Activate / Deactivate for STAFF_MANAGE.
 */
export function CustomerDrawer({ customerId, onClose }: CustomerDrawerProps) {
  const { data, error, isLoading, mutate } = useCustomerDetail(customerId);
  const canManage = useCan(PERMISSIONS.STAFF_MANAGE);
  const canOpenOrders = useCan(PERMISSIONS.ORDERS_READ);
  const { setCustomerActive } = useCustomerMutations();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const detail = data && data.customer.id === customerId ? data : undefined;
  const customer = detail?.customer;

  const toggle = async (isActive: boolean) => {
    if (!customer) {
      return;
    }
    setSaving(true);
    try {
      await setCustomerActive(customer.id, isActive);
      await mutate();
      notifications.show({
        color: "success",
        title: isActive ? "Account reactivated" : "Account deactivated",
        message: isActive
          ? `${customer.fullName} can sign in and order again.`
          : `${customer.fullName} can no longer sign in or place orders.`,
      });
      setConfirming(false);
    } catch (toggleError) {
      notifications.show({ color: "danger", title: "Couldn't update the account", message: getErrorMessage(toggleError) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Drawer
        opened={customerId !== null}
        onClose={onClose}
        position="right"
        size="lg"
        title={<Text fw={700}>Customer details</Text>}
        closeButtonProps={{ "aria-label": "Close customer details" }}
      >
        {isLoading && !detail ? <DrawerSkeleton /> : null}
        {error && !detail ? (
          <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.ORDERS_READ} title="We couldn't load this customer" />
        ) : null}
        {detail ? (
          <Stack gap="lg">
            <CustomerDetailBody detail={detail} canOpenOrders={canOpenOrders} />
            {canManage && customer ? (
              <Paper withBorder radius="md" p="md" bg="var(--mo-color-surface-muted)">
                <Group justify="space-between" gap="sm" wrap="wrap">
                  <Box style={{ flex: "1 1 220px" }}>
                    <Text size="sm" fw={600}>
                      {customer.isActive ? "Deactivate account" : "Reactivate account"}
                    </Text>
                    <Text size="xs" c="var(--mo-color-text-muted)">
                      {customer.isActive
                        ? "Blocks sign-in and new orders. Order history is kept."
                        : "Lets the customer sign in and order again."}
                    </Text>
                  </Box>
                  {customer.isActive ? (
                    <Button
                      variant="light"
                      color="danger"
                      radius="xl"
                      leftSection={<IconUserOff size={16} aria-hidden />}
                      onClick={() => setConfirming(true)}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      variant="light"
                      color="secondaryGreen"
                      radius="xl"
                      loading={saving}
                      leftSection={<IconUserCheck size={16} aria-hidden />}
                      onClick={() => void toggle(true)}
                    >
                      Reactivate
                    </Button>
                  )}
                </Group>
              </Paper>
            ) : null}
          </Stack>
        ) : null}
      </Drawer>

      <ConfirmModal
        opened={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void toggle(false)}
        title="Deactivate this customer?"
        message={
          customer
            ? `${customer.fullName} won't be able to sign in or place orders until you reactivate the account. Their orders and addresses stay on file.`
            : ""
        }
        confirmLabel="Deactivate account"
        color="danger"
        loading={saving}
      />
    </>
  );
}
