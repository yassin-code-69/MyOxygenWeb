"use client";

import { Grid } from "@mantine/core";
import { IconCash, IconRepeat, IconUserPlus, IconUsers } from "@tabler/icons-react";
import { useCustomerKpis } from "../../../hooks/admin/use-customers";
import { useLastDaysRange } from "../../../hooks/admin/use-telemetry";
import { PERMISSIONS } from "../../../types/auth";
import { QueryError } from "../QueryError";
import { formatCount, formatPercent } from "../format";
import { KpiCard } from "../kit";

/** Container-query breakpoints shared by the management pages (the content width, not the viewport, decides). */
export const MANAGEMENT_GRID_BREAKPOINTS = { xs: "480px", sm: "640px", md: "760px", lg: "940px", xl: "1100px" };

/**
 * Customer KPI strip from `GET /admin/reports/customers` over the last 30
 * days. Rendered only for roles with ANALYTICS_READ (the page omits it otherwise).
 */
export function CustomerKpis() {
  const range = useLastDaysRange(30);
  const { data, error, isLoading, mutate } = useCustomerKpis(range);
  const loading = isLoading && !data;
  const kpis = data?.kpis;

  if (error && !data) {
    return (
      <QueryError
        error={error}
        onRetry={() => void mutate()}
        permission={PERMISSIONS.ANALYTICS_READ}
        title="We couldn't load the customer figures"
        compact
      />
    );
  }

  return (
    <Grid type="container" breakpoints={MANAGEMENT_GRID_BREAKPOINTS} gap="md">
      <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
        <KpiCard
          tone="sky"
          icon={<IconUsers size={24} stroke={1.8} />}
          label="Total Customers"
          kpi={kpis?.totalCustomers}
          trendCaption="vs 30 days ago"
          hint="Registered customer accounts"
          loading={loading}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
        <KpiCard
          tone="mint"
          icon={<IconUserPlus size={24} stroke={1.8} />}
          label="New in Last 30 Days"
          kpi={kpis?.newCustomers}
          trendCaption="vs previous 30 days"
          hint="Accounts created in the last 30 days"
          loading={loading}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
        <KpiCard
          tone="lavender"
          icon={<IconRepeat size={24} stroke={1.8} />}
          label="Repeat Rate"
          value={kpis ? formatPercent(kpis.repeatRatePercent) : undefined}
          hint={kpis ? `${formatCount(kpis.returningCustomers.value)} ordered twice or more in 30 days` : undefined}
          loading={loading}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
        <KpiCard
          tone="peach"
          icon={<IconCash size={24} stroke={1.8} />}
          label="Avg Order Value"
          kpi={kpis?.avgOrderValue}
          format="currency"
          trendCaption="vs previous 30 days"
          hint="Excludes cancelled and refunded orders"
          loading={loading}
        />
      </Grid.Col>
    </Grid>
  );
}
