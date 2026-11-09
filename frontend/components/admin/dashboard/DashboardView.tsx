"use client";

import { Grid, Stack } from "@mantine/core";
import { useAdminSummary, useLastDaysRange } from "../../../hooks/admin/use-telemetry";
import { useCan } from "../../../hooks/admin/use-permission";
import { useAuthStore } from "../../../lib/auth-store";
import { PERMISSIONS } from "../../../types/auth";
import { QueryError } from "../QueryError";
import { firstNameOf } from "../format";
import {
  DASHBOARD_GRID_BREAKPOINTS,
  DashboardKpis,
  InventoryAlertsCard,
  LatestCustomersCard,
  OrdersByStatusCard,
  QuickActionsCard,
  RecentOrdersCard,
  SalesOverviewCard,
  TopCategoriesCard,
  TopProductsCard,
  type DashboardAccess,
} from "./DashboardSections";
import { DashboardWelcome } from "./DashboardWelcome";

const PERIOD_LABEL = "Last 7 days";

/**
 * `/admin` dashboard (mockup 1): fixed last-7-days summary
 * (`GET /admin/analytics/summary`), with links to the reports for other ranges.
 */
export function DashboardView() {
  const fullName = useAuthStore((state) => state.user?.fullName ?? "");
  const range = useLastDaysRange(7);
  const { data, error, isLoading, mutate } = useAdminSummary(range);
  const access: DashboardAccess = {
    orders: useCan(PERMISSIONS.ORDERS_READ),
    products: useCan(PERMISSIONS.PRODUCTS_READ),
    batches: useCan(PERMISSIONS.BATCHES_MANAGE),
  };
  const loading = isLoading && !data;
  const failed = Boolean(error) && !data;

  return (
    <Stack gap="lg">
      <DashboardWelcome firstName={firstNameOf(fullName)} />

      {failed ? (
        <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.ANALYTICS_READ} title="We couldn't load the dashboard" />
      ) : (
        <>
          <DashboardKpis data={data} loading={loading} range={range} />

          <Grid type="container" breakpoints={DASHBOARD_GRID_BREAKPOINTS} gap="md">
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <SalesOverviewCard data={data} loading={loading} periodLabel={PERIOD_LABEL} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <OrdersByStatusCard data={data} loading={loading} access={access} periodLabel={PERIOD_LABEL} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <RecentOrdersCard data={data} loading={loading} access={access} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <TopProductsCard data={data} loading={loading} access={access} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
              <LatestCustomersCard data={data} loading={loading} access={access} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
              <TopCategoriesCard data={data} loading={loading} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
              <InventoryAlertsCard data={data} loading={loading} access={access} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
              <QuickActionsCard />
            </Grid.Col>
          </Grid>
        </>
      )}
    </Stack>
  );
}
