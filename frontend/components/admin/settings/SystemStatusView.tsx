"use client";

import type { CSSProperties, ReactNode } from "react";
import { Badge, Box, Button, Group, SimpleGrid, Skeleton, Stack, Text, type MantineColor } from "@mantine/core";
import {
  IconApi,
  IconBolt,
  IconDatabase,
  IconMail,
  IconMessage,
  IconRefresh,
  IconServerCog,
  IconStack2,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { SYSTEM_STATUS_REFRESH_MS, useSystemStatus } from "../../../hooks/admin/use-system-status";
import { PERMISSIONS } from "../../../types/auth";
import type { AdminSystemStatus } from "../../../types/admin-management";
import { QueryError } from "../QueryError";
import { BUSINESS_TIMEZONE, formatCount } from "../format";
import { PageHeader, TONES, type KpiTone } from "../kit";
import classes from "./settings.module.css";

type HealthState = "ok" | "info" | "warning" | "danger";

interface StatusItem {
  key: string;
  title: string;
  icon: ReactNode;
  tone: KpiTone;
  state: HealthState;
  badge: string;
  facts: ReadonlyArray<readonly [string, ReactNode]>;
  guidance?: ReactNode;
}

const BADGE_COLORS: Record<HealthState, MantineColor> = {
  ok: "success",
  info: "info",
  warning: "warning",
  danger: "danger",
};

const SLOW_DATABASE_MS = 300;

const checkedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

/** `93784` s → `1d 2h 3m`; under a minute → `45 s`. */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.max(0, Math.floor(seconds))} s`;
  }
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days > 0 ? `${days}d` : null, hours > 0 || days > 0 ? `${hours}h` : null, `${minutes}m`].filter(Boolean).join(" ");
}

function environmentLabel(nodeEnv: string): string {
  if (nodeEnv === "production") {
    return "Production";
  }
  if (nodeEnv === "development") {
    return "Development";
  }
  return nodeEnv.charAt(0).toUpperCase() + nodeEnv.slice(1);
}

function Env({ children }: { children: ReactNode }) {
  return <code>{children}</code>;
}

/** Turns the status payload into cards with a verdict and plain-language guidance. Only booleans, counts and names are shown — never secrets. */
function buildItems(status: AdminSystemStatus): StatusItem[] {
  const production = status.api.nodeEnv === "production";
  const { database, jobs, integrations } = status;

  const databaseState: HealthState =
    database.status === "DISCONNECTED"
      ? "danger"
      : database.migrationsApplied === 0 || (database.latencyMs !== null && database.latencyMs > SLOW_DATABASE_MS)
        ? "warning"
        : "ok";

  const courierIsMock = integrations.courier.provider.toLowerCase() === "mock";
  const courierState: HealthState = !integrations.courier.configured ? "warning" : courierIsMock ? (production ? "warning" : "info") : "ok";

  return [
    {
      key: "api",
      title: "API server",
      icon: <IconApi size={22} />,
      tone: "mint",
      state: production ? "ok" : "info",
      badge: production ? "Online" : "Online · dev mode",
      facts: [
        ["Version", `v${status.api.version}`],
        ["Running for", formatUptime(status.api.uptimeSeconds)],
        ["Environment", environmentLabel(status.api.nodeEnv)],
        ["Business timezone", status.api.timezone],
      ],
      guidance: production ? undefined : (
        <>
          Development mode is fine for testing. The live store should run with <Env>NODE_ENV=production</Env>.
        </>
      ),
    },
    {
      key: "database",
      title: "Database",
      icon: <IconDatabase size={22} />,
      tone: "sky",
      state: databaseState,
      badge: database.status === "DISCONNECTED" ? "Unreachable" : databaseState === "warning" ? "Needs attention" : "Connected",
      facts: [
        ["Response time", database.latencyMs !== null ? `${formatCount(database.latencyMs)} ms` : "—"],
        ["Migrations applied", database.migrationsApplied !== null ? formatCount(database.migrationsApplied) : "—"],
      ],
      guidance:
        database.status === "DISCONNECTED" ? (
          <>
            The API can&apos;t reach the database, so the store can&apos;t take orders. Check that the Supabase project is running and that{" "}
            <Env>DATABASE_URL</Env> is correct, then restart the API.
          </>
        ) : database.migrationsApplied === 0 ? (
          <>
            No database migrations are recorded. Run <Env>bun run db:migrate</Env> in the backend before going live.
          </>
        ) : database.latencyMs !== null && database.latencyMs > SLOW_DATABASE_MS ? (
          <>Queries are slow (over {SLOW_DATABASE_MS} ms). Check the Supabase region and that the API uses the transaction pooler.</>
        ) : undefined,
    },
    {
      key: "jobs",
      title: "Background jobs",
      icon: <IconStack2 size={22} />,
      tone: "lavender",
      state: jobs.queue === "bullmq" ? "ok" : production ? "warning" : "info",
      badge: jobs.queue === "bullmq" ? "Durable queue" : "In-process",
      facts: [
        ["Queue", jobs.queue === "bullmq" ? "BullMQ (Redis)" : "Inside the API process"],
        ["Redis", jobs.redisConfigured ? "Configured" : "Not configured"],
      ],
      guidance:
        jobs.queue === "bullmq" ? undefined : (
          <>
            Emails, SMS, invoice PDFs and the nightly expiry scan run inside the API and are lost if it restarts. Set <Env>REDIS_URL</Env> in production for a
            durable queue.
          </>
        ),
    },
    {
      key: "courier",
      title: "Courier",
      icon: <IconTruckDelivery size={22} />,
      tone: "peach",
      state: courierState,
      badge: !integrations.courier.configured ? "Not configured" : courierIsMock ? "Test mode" : "Configured",
      facts: [
        ["Provider", courierIsMock ? "Mock (simulated)" : integrations.courier.provider.charAt(0).toUpperCase() + integrations.courier.provider.slice(1)],
        ["Booking", integrations.courier.configured ? "Available" : "Unavailable"],
      ],
      guidance: !integrations.courier.configured ? (
        <>
          Add <Env>STEADFAST_API_KEY</Env> and <Env>STEADFAST_SECRET_KEY</Env> to book parcels automatically. Until then, ship manually and type the tracking
          number on the order.
        </>
      ) : courierIsMock ? (
        <>
          Parcels are simulated — no real pickup is booked. Set <Env>COURIER_PROVIDER=steadfast</Env> with <Env>STEADFAST_API_KEY</Env> and{" "}
          <Env>STEADFAST_SECRET_KEY</Env> to ship for real.
        </>
      ) : undefined,
    },
    {
      key: "sms",
      title: "SMS",
      icon: <IconMessage size={22} />,
      tone: "rose",
      state: integrations.sms.configured ? "ok" : "warning",
      badge: integrations.sms.configured ? "Configured" : "Not configured",
      facts: [
        ["Provider", "SSL Wireless"],
        ["Order texts", integrations.sms.configured ? "Sending" : "Skipped"],
      ],
      guidance: integrations.sms.configured ? undefined : (
        <>
          Customers get no order text messages. Set <Env>SSL_WIRELESS_API_TOKEN</Env> and <Env>SSL_WIRELESS_SID</Env> to send them.
        </>
      ),
    },
    {
      key: "email",
      title: "Email",
      icon: <IconMail size={22} />,
      tone: "sky",
      state: integrations.email.configured ? "ok" : "warning",
      badge: integrations.email.configured ? "Configured" : "Not configured",
      facts: [
        ["Provider", "Resend"],
        ["Order emails", integrations.email.configured ? "Sending" : "Skipped"],
      ],
      guidance: integrations.email.configured ? undefined : (
        <>
          Order emails and the daily stock digest are skipped. Set <Env>RESEND_API_KEY</Env> and <Env>EMAIL_FROM</Env> to send them.
        </>
      ),
    },
    {
      key: "cache",
      title: "Catalog cache",
      icon: <IconBolt size={22} />,
      tone: "mint",
      state: "ok",
      badge: "Active",
      facts: [["Cached pages", formatCount(status.cache.entries)]],
      guidance: <>Store pages for visitors are kept in memory for up to 5 minutes so they load fast, and refresh after product changes.</>,
    },
  ];
}

function StatusCard({ item }: { item: StatusItem }) {
  const tone = TONES[item.tone];
  const vars = { "--tile-icon-bg": tone.iconBg, "--tile-icon": tone.icon } as CSSProperties;
  const guidanceState = item.state === "danger" ? "danger" : item.state === "warning" ? "warning" : undefined;
  return (
    <Box component="section" className={classes.statusCard} data-state={item.state} aria-labelledby={`status-${item.key}`}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <div className={classes.statusIcon} style={vars} aria-hidden>
            {item.icon}
          </div>
          <Text component="h2" id={`status-${item.key}`} m={0} fw={600} fz="md" ff="var(--mo-font-heading)" c="var(--mo-color-text)" truncate>
            {item.title}
          </Text>
        </Group>
        <Badge color={BADGE_COLORS[item.state]} variant="light" radius="xl" tt="none" fw={600} style={{ flexShrink: 0, maxWidth: "none" }}>
          {item.badge}
        </Badge>
      </Group>
      <dl className={classes.facts}>
        {item.facts.map(([label, value]) => (
          <Box key={label} display="contents">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Box>
        ))}
      </dl>
      {item.guidance ? (
        <Text component="p" m={0} className={classes.guidance} data-state={guidanceState}>
          {item.guidance}
        </Text>
      ) : null}
    </Box>
  );
}

function StatusCardSkeleton() {
  return (
    <Box className={classes.statusCard} aria-hidden>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Skeleton circle height={44} />
          <Skeleton height={14} width={110} radius="xl" />
        </Group>
        <Skeleton height={20} width={84} radius="xl" />
      </Group>
      <Stack gap={8}>
        {Array.from({ length: 3 }, (_, index) => (
          <Group key={index} justify="space-between">
            <Skeleton height={10} width={90} radius="xl" />
            <Skeleton height={12} width={70} radius="xl" />
          </Group>
        ))}
      </Stack>
      <Skeleton height={48} radius="sm" />
    </Box>
  );
}

function OverallBanner({ items }: { items: readonly StatusItem[] }) {
  const down = items.filter((item) => item.state === "danger");
  const attention = items.filter((item) => item.state === "warning");
  const tone = down.length > 0 ? TONES.rose : attention.length > 0 ? TONES.peach : TONES.mint;
  const vars = { "--banner-surface": tone.surface, "--banner-border": tone.border } as CSSProperties;
  const title =
    down.length > 0
      ? `${down.map((item) => item.title).join(", ")} ${down.length === 1 ? "is" : "are"} down`
      : attention.length > 0
        ? `${attention.length} ${attention.length === 1 ? "item needs" : "items need"} attention`
        : "All systems running";
  const detail =
    down.length > 0
      ? "Customers may not be able to order until this is fixed."
      : attention.length > 0
        ? `${attention.map((item) => item.title).join(", ")} — see the notes below.`
        : "Everything the store depends on is reachable and configured.";
  return (
    <Box className={classes.banner} style={vars} role="status">
      <Box c={tone.icon} display="flex" aria-hidden>
        <span className={classes.pulse} />
      </Box>
      <Box style={{ minWidth: 0 }}>
        <Text fw={600} c="var(--mo-color-text)">
          {title}
        </Text>
        <Text size="sm" c="var(--mo-color-text-muted-on-tint)">
          {detail}
        </Text>
      </Box>
    </Box>
  );
}

/** `/admin/settings/system` (STAFF_MANAGE): live status of the API, database, jobs and integrations; refreshes every 30 s. */
export function SystemStatusView() {
  const { data, error, isValidating, mutate, checkedAt } = useSystemStatus();
  const items = data ? buildItems(data) : null;
  const seconds = Math.round(SYSTEM_STATUS_REFRESH_MS / 1000);

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconServerCog size={20} />}
        title="System Settings"
        subtitle={`Live health of the services behind your store. Refreshes every ${seconds} seconds; secrets are never shown.`}
        mb={0}
        actions={
          <Group gap="sm" wrap="nowrap">
            <Text size="xs" c="var(--mo-color-text-muted)" aria-live="polite" style={{ whiteSpace: "nowrap" }}>
              {checkedAt ? `Checked at ${checkedFormatter.format(checkedAt)}` : "Checking…"}
            </Text>
            <Button variant="default" radius="xl" leftSection={<IconRefresh size={16} aria-hidden />} loading={isValidating} onClick={() => void mutate()}>
              Check now
            </Button>
          </Group>
        }
      />

      {error && !data ? (
        <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.STAFF_MANAGE} title="We couldn't reach the API" />
      ) : (
        <>
          {items ? <OverallBanner items={items} /> : <Skeleton height={74} radius="md" />}
          <SimpleGrid type="container" cols={{ base: 1, "640px": 2, "1000px": 3 }} spacing="md">
            {items
              ? items.map((item) => <StatusCard key={item.key} item={item} />)
              : Array.from({ length: 7 }, (_, index) => <StatusCardSkeleton key={index} />)}
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}
