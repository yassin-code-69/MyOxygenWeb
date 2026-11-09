"use client";

import { Box, Divider, Group, Text, Title, Tooltip } from "@mantine/core";
import { IconCalendarEvent } from "@tabler/icons-react";
import { useStoreStatus, type StoreStatus } from "../../../hooks/admin/use-store-status";
import { formatDhakaTime, formatDhakaWeekdayDate } from "../format";
import { useNow } from "../kit/use-now";
import classes from "./dashboard.module.css";

const STATUS_TEXT: Record<StoreStatus, string> = {
  online: "Store Online",
  offline: "Store Offline",
  checking: "Checking store…",
};

/** "Store Online" pill driven by `GET /health` (re-checked every 30 s). */
export function StoreStatusPill() {
  const { status, data, error } = useStoreStatus();
  let help = "Checking that the store API and database are reachable.";
  if (status === "online") {
    help = `API and database are reachable${typeof data?.latencyMs === "number" ? ` (database ${data.latencyMs} ms)` : ""}.`;
  } else if (status === "offline") {
    help = error ? "The store API can't be reached right now. Customers may not be able to order." : "The database is disconnected. Customers can't place orders.";
  }
  return (
    <Tooltip label={help} multiline w={260}>
      <span className={classes.storePill} data-status={status} role="status" aria-live="polite">
        <span className={classes.statusDot} aria-hidden />
        {STATUS_TEXT[status]}
      </span>
    </Tooltip>
  );
}

export interface DashboardWelcomeProps {
  firstName: string;
}

/** Greeting, live Dhaka date/time and store status (mockup header row). */
export function DashboardWelcome({ firstName }: DashboardWelcomeProps) {
  const now = useNow(30_000);
  const iso = new Date(now).toISOString();
  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="md">
      <Box style={{ minWidth: 0 }}>
        <Title order={1} fz={{ base: 22, sm: 26 }} fw={600} lh={1.3} c="var(--mo-color-text)">
          Welcome back{firstName ? `, ${firstName}` : ""}{" "}
          <span role="img" aria-label="waving hand">
            👋
          </span>
        </Title>
        <Text size="sm" c="var(--mo-color-text-muted)" mt={4}>
          Here&apos;s what&apos;s happening with your store today.
        </Text>
      </Box>
      <Group gap="md" wrap="wrap">
        <div className={classes.clockCard}>
          <span className={classes.clockIcon} aria-hidden>
            <IconCalendarEvent size={20} stroke={1.7} />
          </span>
          <Box>
            <Text component="time" dateTime={iso} size="sm" fw={600} c="var(--mo-color-text)" display="block" lh={1.35}>
              {formatDhakaWeekdayDate(new Date(now))}
            </Text>
            <Text size="sm" c="var(--mo-color-text-muted)" lh={1.35} className="mo-tabular-nums">
              {formatDhakaTime(new Date(now))} <span style={{ fontSize: "var(--mantine-font-size-xs)" }}>Dhaka</span>
            </Text>
          </Box>
        </div>
        <Divider orientation="vertical" h={40} my="auto" color="var(--mo-color-border)" visibleFrom="xs" />
        <StoreStatusPill />
      </Group>
    </Group>
  );
}
