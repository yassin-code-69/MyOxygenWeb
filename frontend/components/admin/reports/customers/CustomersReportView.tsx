"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, Box, Grid, Group, Skeleton, Stack, Text } from "@mantine/core";
import { IconCash, IconRepeat, IconUserPlus, IconUsers, IconUsersGroup, IconPercentage } from "@tabler/icons-react";
import { useCan } from "../../../../hooks/admin/use-permission";
import { useCustomersReport } from "../../../../hooks/admin/use-reports";
import { PERMISSIONS } from "../../../../types/auth";
import type { CustomerReportTopCustomer } from "../../../../types/admin-reports";
import {
  ChartViewToggle,
  DateRangePicker,
  PageHeader,
  ProgressList,
  SectionCard,
  TONES,
  formatRangeDates,
  previousPeriodCaption,
  rangeDays,
  type ChartView,
  type KpiTone,
} from "../../kit";
import { QueryError } from "../../QueryError";
import { formatCount, formatDhakaDate, formatDhakaDateTime, formatMoney, formatPercent, initialsOf, pluralize } from "../../format";
import kitClasses from "../../kit/kit.module.css";
import { ReportKpiGrid } from "../ReportKpiGrid";
import { ReportTable, type ReportColumn } from "../ReportTable";
import { REPORT_GRID_BREAKPOINTS, formatTaka } from "../report-utils";
import { useUrlDateRange } from "../url-state";
import { SignupChart } from "./SignupChart";
import classes from "../reports.module.css";

const AVATAR_TONES: readonly KpiTone[] = ["lavender", "sky", "mint", "peach", "rose"];

/**
 * `/admin/reports/customers`: customer base, sign-ups, repeat buyers,
 * districts and top spenders for any period (`GET /admin/reports/customers`).
 */
export function CustomersReportView() {
  const [range, setRange] = useUrlDateRange("last30");
  const canOpenCustomers = useCan(PERMISSIONS.ORDERS_READ);
  const signature = `${range.from}|${range.to}`;
  const [paging, setPaging] = useState({ signature, page: 1, limit: 10 });
  const page = paging.signature === signature ? paging.page : 1;

  const query = useCustomersReport(range, page, paging.limit);
  // SWR keeps the previous payload while a new key loads: reuse it only when it
  // answers the same period (another page), never another period's numbers.
  const data = query.data;
  const sameRange = data && data.range.from === range.from && data.range.to === range.to ? data : undefined;
  const failed = Boolean(query.error) && !data;
  const caption = previousPeriodCaption(range);
  const kpis = sameRange?.report.kpis;
  const [view, setView] = useState<ChartView>("chart");
  const periodText = formatRangeDates(range);
  const granularity = rangeDays(range) > 92 ? "Monthly" : "Daily";

  const maxRevenue = Math.max(1, ...(sameRange?.report.byDistrict.map((row) => row.revenue) ?? [1]));
  const districts = sameRange?.report.byDistrict.map((row) => ({
    key: row.district,
    label: row.district,
    percent: (row.revenue / maxRevenue) * 100,
    // Rendered inside the kit's <p>: inline elements only.
    value: (
      <>
        <Text span size="xs" c="var(--mo-color-text-muted)" fw={500} mr={6}>
          {pluralize(row.orders, "order")}
        </Text>
        {formatTaka(row.revenue)}
      </>
    ),
  }));

  const columns: ReportColumn<CustomerReportTopCustomer>[] = [
    {
      key: "rank",
      header: "#",
      width: 40,
      cell: (_row, index) => (
        <Text size="sm" c="var(--mo-color-text-secondary)" className="mo-tabular-nums">
          {(page - 1) * paging.limit + index + 1}
        </Text>
      ),
      skeletonWidth: 14,
    },
    {
      key: "customer",
      header: "Customer",
      minWidth: 200,
      cell: (row, index) => {
        const tone = TONES[AVATAR_TONES[index % AVATAR_TONES.length] ?? "mint"];
        return (
          <Group gap="sm" wrap="nowrap">
            <Avatar radius="xl" size={32} styles={{ placeholder: { backgroundColor: tone.iconBg, color: tone.icon, fontSize: 12, fontWeight: 700 } }} aria-hidden>
              {initialsOf(row.fullName)}
            </Avatar>
            <Box style={{ minWidth: 0 }}>
              {canOpenCustomers ? (
                <Text component={Link} href={`/admin/customers?customerId=${encodeURIComponent(row.id)}`} size="sm" fw={600} lineClamp={1} className={kitClasses.cellLink}>
                  {row.fullName}
                </Text>
              ) : (
                <Text size="sm" fw={600} lineClamp={1}>
                  {row.fullName}
                </Text>
              )}
              <Text size="xs" c="var(--mo-color-text-muted)" lineClamp={1}>
                {row.email ?? "No email"}
              </Text>
            </Box>
          </Group>
        );
      },
      skeleton: (
        <Group gap="sm" wrap="nowrap">
          <Skeleton circle height={32} />
          <Box style={{ flex: 1 }}>
            <Skeleton height={11} width="70%" radius="xl" />
            <Skeleton height={9} width="50%" radius="xl" mt={7} />
          </Box>
        </Group>
      ),
    },
    { key: "phone", header: "Phone", cell: (row) => <Text size="sm" className={classes.num}>{row.phone}</Text>, skeletonWidth: 90 },
    { key: "orders", header: "Orders", align: "right", cell: (row) => <Text size="sm" className={classes.num}>{formatCount(row.orders)}</Text>, skeletonWidth: 24 },
    {
      key: "spent",
      header: "Total spent",
      align: "right",
      minWidth: 100,
      cell: (row) => (
        <Text size="sm" fw={600} className={classes.num}>
          {formatMoney(row.totalSpent)}
        </Text>
      ),
      skeletonWidth: 64,
    },
    {
      key: "last",
      header: "Last order",
      minWidth: 110,
      cell: (row) =>
        row.lastOrderAt ? (
          <Text component="time" dateTime={row.lastOrderAt} title={formatDhakaDateTime(row.lastOrderAt)} size="sm" c="var(--mo-color-text-secondary)" className={classes.nowrap}>
            {formatDhakaDate(row.lastOrderAt)}
          </Text>
        ) : (
          <Text size="sm" c="var(--mo-color-text-muted)">
            —
          </Text>
        ),
      skeletonWidth: 72,
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconUsersGroup size={18} aria-hidden />}
        title="Customer Report"
        subtitle="New, returning and top customers, and where your orders go."
        actions={<DateRangePicker value={range} onChange={setRange} label="Report period" />}
        mb={0}
      />

      {failed ? (
        <QueryError error={query.error} onRetry={() => void query.mutate()} permission={PERMISSIONS.ANALYTICS_READ} title="We couldn't load the customer report" />
      ) : (
        <>
          <ReportKpiGrid
            items={[
              { key: "total", tone: "sky", icon: <IconUsers size={24} stroke={1.8} />, label: "Total Customers", kpi: kpis?.totalCustomers, format: "count", trendCaption: caption, hint: "Registered customer accounts", loading: !kpis },
              { key: "new", tone: "lavender", icon: <IconUserPlus size={24} stroke={1.8} />, label: "New Customers", kpi: kpis?.newCustomers, format: "count", trendCaption: caption, hint: "Signed up in this period", loading: !kpis },
              { key: "repeat", tone: "mint", icon: <IconRepeat size={24} stroke={1.8} />, label: "Repeat Buyers", kpi: kpis?.returningCustomers, format: "count", trendCaption: caption, hint: "2+ orders in this period", loading: !kpis },
              {
                key: "rate",
                tone: "peach",
                icon: <IconPercentage size={24} stroke={1.8} />,
                label: "Repeat Rate",
                value: kpis ? formatPercent(kpis.repeatRatePercent) : undefined,
                hint: "Of customers who ordered",
                loading: !kpis,
              },
              { key: "aov", tone: "rose", icon: <IconCash size={24} stroke={1.8} />, label: "Avg. Order Value", kpi: kpis?.avgOrderValue, format: "currency", trendCaption: caption, hint: "Revenue ÷ revenue orders", loading: !kpis },
            ]}
          />

          <Grid type="container" breakpoints={REPORT_GRID_BREAKPOINTS} gap="md">
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <SectionCard
                title="New Sign-ups"
                subtitle={`${granularity} customer registrations · ${periodText}`}
                actions={<ChartViewToggle value={view} onChange={setView} subject="sign-ups" />}
              >
                <SignupChart points={sameRange?.report.signupSeries} view={view} periodLabel={periodText} />
              </SectionCard>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <SectionCard title="Orders by District" subtitle={`Top 10 shipping districts by revenue · ${periodText}`}>
                <ProgressList
                  items={districts}
                  loading={!sameRange}
                  skeletonCount={8}
                  labelWidth={110}
                  emptyTitle="No orders in this period"
                  emptyDescription="Districts appear once orders are shipped."
                />
              </SectionCard>
            </Grid.Col>
            <Grid.Col span={12}>
              <SectionCard title="Top Customers" subtitle={`By spend · ${periodText}`} viewAllHref={canOpenCustomers ? "/admin/customers" : undefined} flush>
                <ReportTable
                  columns={columns}
                  rows={sameRange?.report.topCustomers}
                  getRowKey={(row) => row.id}
                  label="Top customers"
                  loading={!sameRange}
                  refreshing={query.isLoading && Boolean(sameRange)}
                  error={query.error}
                  onRetry={() => void query.mutate()}
                  skeletonRows={paging.limit}
                  minWidth={720}
                  emptyTitle="No orders in this period"
                  emptyDescription="Customers who order appear here, ranked by spend."
                  emptyIcon={<IconUsersGroup stroke={1.6} />}
                  pagination={
                    sameRange
                      ? {
                          page: sameRange.meta.page,
                          totalPages: sameRange.meta.totalPages,
                          total: sameRange.meta.total,
                          limit: sameRange.meta.limit,
                          onPageChange: (next) => setPaging({ signature, page: next, limit: paging.limit }),
                          onLimitChange: (limit) => setPaging({ signature, page: 1, limit }),
                          itemLabel: "customers",
                          pageSizes: [10, 20, 50],
                        }
                      : undefined
                  }
                />
              </SectionCard>
            </Grid.Col>
          </Grid>
        </>
      )}
    </Stack>
  );
}
