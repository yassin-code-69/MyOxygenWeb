"use client";

import Link from "next/link";
import { Badge, Box, Button, Group, SimpleGrid, Skeleton, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconClick, IconCoins, IconEdit } from "@tabler/icons-react";
import { EmptyState } from "../../../EmptyState";
import { useProfitProductDetail } from "../../../../hooks/admin/use-reports";
import type { ProfitProductDetail } from "../../../../types/admin-reports";
import type { AdminDateRange } from "../../../../types/admin-dashboard";
import { SectionCard, Thumb, formatRangeDates } from "../../kit";
import { QueryError } from "../../QueryError";
import { formatMoney, formatPercent, pluralize } from "../../format";
import classes from "../reports.module.css";

export interface ProductProfitDetailCardProps {
  productId: string | null;
  range: AdminDateRange;
  /** False while the product list itself is still loading. */
  listReady: boolean;
  canOpenProducts: boolean;
}

/**
 * "Product Profitability Details" (mockup 3, right column):
 * `GET /admin/reports/profit/products/:id?from&to`.
 */
export function ProductProfitDetailCard({ productId, range, listReady, canOpenProducts }: ProductProfitDetailCardProps) {
  const { data, error, isLoading, mutate } = useProfitProductDetail(productId, range);
  const detail = isLoading ? undefined : data;
  const productHref = productId && canOpenProducts ? `/admin/products?productId=${encodeURIComponent(productId)}` : undefined;

  let body;
  if (!productId) {
    body = listReady ? (
      <EmptyState
        withCard={false}
        size="sm"
        color="secondaryGreen"
        icon={<IconClick stroke={1.6} />}
        title="Pick a product"
        description="Select a product in the table to see its revenue, landed cost and margin."
      />
    ) : (
      <DetailSkeleton />
    );
  } else if (error && !detail) {
    body = <QueryError error={error} onRetry={() => void mutate()} compact title="This product's figures didn't load" />;
  } else if (!detail) {
    body = <DetailSkeleton />;
  } else {
    body = <DetailBody detail={detail} range={range} productHref={productHref} />;
  }

  return (
    <SectionCard title="Profitability Details" viewAllHref={productHref} viewAllLabel="View Product">
      {body}
    </SectionCard>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: "profit" | "loss" }) {
  return (
    <div className={classes.stat}>
      <Text size="xs" c="var(--mo-color-text-muted)" truncate>
        {label}
      </Text>
      <div
        className={classes.statValue}
        style={tone ? { color: tone === "loss" ? "var(--mo-color-danger-8)" : "var(--mo-color-success-8)" } : undefined}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={classes.breakdownRow}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function DetailBody({ detail, range, productHref }: { detail: ProfitProductDetail; range: AdminDateRange; productHref?: string }) {
  const { product, pricing, costBreakdown } = detail;
  const loss = detail.grossProfit < 0;
  const unitLoss = pricing.profitPerUnit < 0;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: "1 1 220px" }}>
          <Thumb src={product.image} size={56} alt="" />
          <Box style={{ minWidth: 0 }}>
            <Group gap={8} wrap="nowrap">
              <Text fw={600} lineClamp={1} c="var(--mo-color-text)">
                {product.title}
              </Text>
              <Badge variant="light" radius="xl" size="sm" tt="none" fw={600} color={product.isActive ? "success" : "gray"} style={{ flex: "0 0 auto" }}>
                {product.isActive ? "Active" : "Inactive"}
              </Badge>
            </Group>
            <Text size="xs" c="var(--mo-color-text-muted)" lineClamp={1}>
              {product.category?.name ?? "Uncategorised"} · SKU: {product.sku}
            </Text>
          </Box>
        </Group>
        <Box ta="right" style={{ flex: "0 0 auto" }}>
          <Text size="xs" c="var(--mo-color-text-muted)">
            {formatRangeDates(range)}
          </Text>
          <Text size="xs" fw={600} c="var(--mo-color-text-secondary)">
            Total sales: {pluralize(detail.unitsSold, "unit")}
          </Text>
        </Box>
      </Group>

      <SimpleGrid type="container" cols={{ base: 2, "560px": 4 }} spacing="xs" verticalSpacing="xs">
        <StatBox label="Total Revenue" value={formatMoney(detail.revenue)} />
        <StatBox label="Total Cost" value={formatMoney(detail.cogs)} />
        <StatBox label="Gross Profit" value={formatMoney(detail.grossProfit)} tone={loss ? "loss" : "profit"} />
        <StatBox label="Margin" value={formatPercent(detail.marginPercent, 2)} tone={detail.marginPercent < 0 ? "loss" : "profit"} />
      </SimpleGrid>

      <SimpleGrid type="container" cols={{ base: 1, "560px": 2 }} spacing="sm" verticalSpacing="sm">
        <div className={classes.breakdown}>
          <Text size="sm" fw={600} mb={6} c="var(--mo-color-text)">
            Cost Breakdown (per unit)
          </Text>
          {costBreakdown ? (
            <>
              <Row label="Supplier Price" value={formatMoney(costBreakdown.supplierPrice)} />
              <Row label="International Shipping" value={formatMoney(costBreakdown.shipping)} />
              <Row label="Customs / Duty / Tax" value={formatMoney(costBreakdown.customsDuty)} />
              <Row label="Packaging" value={formatMoney(costBreakdown.packaging)} />
              <Row label="Other Cost" value={formatMoney(costBreakdown.other)} />
              <div className={`${classes.breakdownRow} ${classes.breakdownTotal}`}>
                <span>Total Cost (Landed Cost)</span>
                <span>{formatMoney(costBreakdown.landedCost)}</span>
              </div>
            </>
          ) : (
            <Stack gap={8} align="flex-start" py={4}>
              <Group gap={8} wrap="nowrap" align="flex-start">
                <ThemeIcon size={28} radius="xl" variant="light" color="warning" style={{ flex: "0 0 auto" }}>
                  <IconCoins size={16} aria-hidden />
                </ThemeIcon>
                <Text size="xs" c="var(--mo-color-text-secondary)">
                  No cost breakdown recorded for this product. Margins use its single cost price; add supplier, shipping and duty costs to see
                  the landed cost per unit.
                </Text>
              </Group>
              {productHref ? (
                <Button component={Link} href={productHref} size="compact-xs" radius="xl" variant="light" color="secondaryGreen" leftSection={<IconEdit size={14} aria-hidden />}>
                  Add cost breakdown
                </Button>
              ) : null}
            </Stack>
          )}
        </div>

        <div className={classes.breakdown}>
          <Text size="sm" fw={600} mb={6} c="var(--mo-color-text)">
            Selling Price & Profit
          </Text>
          <Row label="Selling Price" value={formatMoney(pricing.basePrice)} />
          <Row label="Discount (avg.)" value={pricing.avgDiscountPerUnit > 0 ? `−${formatMoney(pricing.avgDiscountPerUnit)}` : formatMoney(0)} />
          <div className={`${classes.breakdownRow} ${classes.breakdownTotal}`}>
            <span>Net Selling Price</span>
            <span>{formatMoney(pricing.netSellingPrice)}</span>
          </div>
          <div className={classes.breakdownRow}>
            <span>Profit (per unit)</span>
            <span style={{ color: unitLoss ? "var(--mo-color-danger-8)" : "var(--mo-color-success-8)", fontWeight: 700 }}>{formatMoney(pricing.profitPerUnit)}</span>
          </div>
          <div className={classes.marginBox} data-tone={pricing.marginPercent < 0 ? "loss" : undefined}>
            <span>Margin</span>
            <Text span fz="lg" fw={700} c="inherit" className="mo-tabular-nums">
              {formatPercent(pricing.marginPercent, 2)}
            </Text>
          </div>
        </div>
      </SimpleGrid>
      {detail.unitsSold === 0 ? (
        <Text size="xs" c="var(--mo-color-text-muted)">
          Not sold in this period: the prices shown are the current list price and cost.
        </Text>
      ) : null}
    </Stack>
  );
}

function DetailSkeleton() {
  return (
    <Stack gap="md" aria-hidden>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>
          <Skeleton height={56} width={56} radius="sm" />
          <Box style={{ flex: 1 }}>
            <Skeleton height={14} width="60%" radius="xl" />
            <Skeleton height={10} width="40%" radius="xl" mt={8} />
          </Box>
        </Group>
        <Box w={110}>
          <Skeleton height={10} radius="xl" />
          <Skeleton height={10} radius="xl" mt={8} />
        </Box>
      </Group>
      <SimpleGrid type="container" cols={{ base: 2, "560px": 4 }} spacing="xs" verticalSpacing="xs">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} height={58} radius="sm" />
        ))}
      </SimpleGrid>
      <SimpleGrid type="container" cols={{ base: 1, "560px": 2 }} spacing="sm" verticalSpacing="sm">
        <Skeleton height={214} radius="sm" />
        <Skeleton height={214} radius="sm" />
      </SimpleGrid>
    </Stack>
  );
}
