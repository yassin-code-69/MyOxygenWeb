"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  Badge,
  Box,
  Button,
  CloseButton,
  Grid,
  Group,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconEdit,
  IconPackages,
  IconSearch,
  IconShoppingBag,
  IconTags,
} from "@tabler/icons-react";
import { EmptyState } from "../../EmptyState";
import { useBrands } from "../../../hooks/admin/use-brands";
import { useCan } from "../../../hooks/admin/use-permission";
import { PERMISSIONS } from "../../../types/auth";
import type { AdminBrand } from "../../../types/admin-management";
import { MeterBar } from "../MeterBar";
import { QueryError } from "../QueryError";
import { FilterBar } from "../FilterBar";
import { formatCount, initialsOf, pluralize } from "../format";
import { KPI_TONES, KpiCard, PageHeader, TONES } from "../kit";
import { MANAGEMENT_GRID_BREAKPOINTS } from "../customers/CustomerKpis";
import { readEnum, useUrlParams } from "../payments/url-state";
import { brandKey, findSimilarBrands } from "./brand-utils";
import { RenameBrandModal } from "./RenameBrandModal";
import classes from "./brands.module.css";

const SORTS = ["name", "sold", "products"] as const;
type BrandSort = (typeof SORTS)[number];

const SORT_OPTIONS: { value: BrandSort; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "sold", label: "Best selling (30 days)" },
  { value: "products", label: "Most products" },
];

function sortBrands(brands: readonly AdminBrand[], sort: BrandSort): AdminBrand[] {
  const list = [...brands];
  if (sort === "sold") {
    return list.sort((a, b) => b.unitsSold30d - a.unitsSold30d || a.name.localeCompare(b.name));
  }
  if (sort === "products") {
    return list.sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.name.localeCompare(b.name));
}

function BrandCard({
  brand,
  index,
  maxSold,
  similar,
  canWrite,
  onRename,
}: {
  brand: AdminBrand;
  index: number;
  maxSold: number;
  similar: readonly string[] | undefined;
  canWrite: boolean;
  onRename: (brand: AdminBrand) => void;
}) {
  const tone = TONES[KPI_TONES[index % KPI_TONES.length] ?? "mint"];
  const vars = { "--tile-surface": tone.surface, "--tile-border": tone.border, "--tile-icon": tone.icon } as CSSProperties;
  const inactive = brand.productCount - brand.activeProductCount;
  return (
    <Box component="article" className={classes.card} aria-label={brand.name}>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <div className={classes.monogram} style={vars} aria-hidden>
          {initialsOf(brand.name)}
        </div>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text component="h3" m={0} fw={600} size="md" ff="var(--mo-font-heading)" c="var(--mo-color-text)" truncate>
            {brand.name}
          </Text>
          <Text size="xs" c="var(--mo-color-text-muted)">
            {pluralize(brand.productCount, "product")}
            {inactive > 0 ? ` · ${formatCount(inactive)} inactive` : " · all active"}
          </Text>
        </Box>
      </Group>

      <Box>
        <Group justify="space-between" gap="xs" mb={6}>
          <Text size="xs" c="var(--mo-color-text-secondary)">
            Units sold · 30 days
          </Text>
          <Text size="sm" fw={700} className="mo-tabular-nums" c="var(--mo-color-text)">
            {formatCount(brand.unitsSold30d)}
          </Text>
        </Group>
        <MeterBar ratio={maxSold > 0 ? brand.unitsSold30d / maxSold : 0} color={tone.chart} />
      </Box>

      {similar && similar.length > 0 ? (
        <Badge
          color="warning"
          variant="light"
          radius="xl"
          tt="none"
          fw={600}
          leftSection={<IconAlertTriangle size={12} aria-hidden />}
          style={{ maxWidth: "100%" }}
        >
          Looks like {similar.map((name) => `“${name}”`).join(", ")}
        </Badge>
      ) : null}

      <div className={classes.footer}>
        <Link href={`/admin/products?brand=${encodeURIComponent(brand.name)}`} className={classes.link} aria-label={`View products by ${brand.name}`}>
          View products
          <IconArrowRight size={14} stroke={2.2} aria-hidden />
        </Link>
        {canWrite ? (
          <Tooltip label={similar && similar.length > 0 ? "Merge the duplicate spellings" : "Rename on every product"} withArrow>
            <Button
              size="compact-sm"
              variant="subtle"
              color="gray"
              radius="xl"
              leftSection={<IconEdit size={14} aria-hidden />}
              onClick={() => onRename(brand)}
              aria-label={`Rename or merge ${brand.name}`}
            >
              {similar && similar.length > 0 ? "Merge" : "Rename"}
            </Button>
          </Tooltip>
        ) : null}
      </div>
    </Box>
  );
}

function BrandCardSkeleton() {
  return (
    <Box className={classes.card} aria-hidden>
      <Group gap="sm" wrap="nowrap">
        <Skeleton height={44} width={44} radius="md" />
        <Stack gap={6} style={{ flex: 1 }}>
          <Skeleton height={14} width="60%" radius="xl" />
          <Skeleton height={10} width="45%" radius="xl" />
        </Stack>
      </Group>
      <Box>
        <Group justify="space-between" mb={6}>
          <Skeleton height={10} width={110} radius="xl" />
          <Skeleton height={12} width={24} radius="xl" />
        </Group>
        <Skeleton height={8} radius="xl" />
      </Box>
      <div className={classes.footer}>
        <Skeleton height={10} width={90} radius="xl" />
        <Skeleton height={22} width={76} radius="xl" />
      </div>
    </Box>
  );
}

/**
 * `/admin/brands` (PRODUCTS_READ; rename PRODUCTS_WRITE). URL state: `?q`,
 * `?sort`, `?brand=<exact name>` (opens the rename / merge dialog).
 */
export function BrandsView() {
  const { searchParams, setParams } = useUrlParams();
  const canWrite = useCan(PERMISSIONS.PRODUCTS_WRITE);
  const { data, error, isLoading, mutate } = useBrands();

  const q = searchParams.get("q") ?? "";
  const sort = readEnum(searchParams.get("sort"), SORTS, "name");
  const renameName = searchParams.get("brand");

  const [search, setSearch] = useState(q);
  const pushSearch = useDebouncedCallback((value: string) => setParams({ q: value.trim() }), 200);

  const brands = useMemo(() => data ?? [], [data]);
  const similar = useMemo(() => findSimilarBrands(brands), [brands]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sortBrands(
      brands.filter((brand) => needle === "" || brand.name.toLowerCase().includes(needle)),
      sort,
    );
  }, [brands, q, sort]);
  const maxSold = useMemo(() => brands.reduce((max, brand) => Math.max(max, brand.unitsSold30d), 0), [brands]);
  const renaming = canWrite && renameName !== null ? (brands.find((brand) => brand.name === renameName) ?? null) : null;

  const totals = data
    ? {
        brands: data.length,
        products: data.reduce((sum, brand) => sum + brand.productCount, 0),
        sold: data.reduce((sum, brand) => sum + brand.unitsSold30d, 0),
        duplicates: new Set([...similar.keys()].map(brandKey)).size,
      }
    : null;
  const loading = isLoading && !data;
  const activeFilters = (q ? 1 : 0) + (sort !== "name" ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    pushSearch.cancel();
    setParams({ q: null, sort: null });
  };

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconTags size={20} />}
        title="Brands"
        subtitle="Every brand on your products, with 30-day sales. Fix spelling or merge duplicates in one step."
        mb={0}
      />

      <Grid type="container" breakpoints={MANAGEMENT_GRID_BREAKPOINTS} gap="md">
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard tone="lavender" icon={<IconTags size={24} stroke={1.8} />} label="Brands" value={totals ? formatCount(totals.brands) : undefined} hint="Distinct brand names" loading={loading} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard tone="sky" icon={<IconPackages size={24} stroke={1.8} />} label="Branded Products" value={totals ? formatCount(totals.products) : undefined} hint="Products with a brand set" loading={loading} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard tone="mint" icon={<IconShoppingBag size={24} stroke={1.8} />} label="Units Sold (30 days)" value={totals ? formatCount(totals.sold) : undefined} hint="Across every brand" loading={loading} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard
            tone={totals && totals.duplicates > 0 ? "peach" : "mint"}
            icon={totals && totals.duplicates > 0 ? <IconAlertTriangle size={24} stroke={1.8} /> : <IconCircleCheck size={24} stroke={1.8} />}
            label="Possible Duplicates"
            value={totals ? formatCount(totals.duplicates) : undefined}
            hint={totals && totals.duplicates > 0 ? "Same name, different spelling — merge them" : "No duplicate spellings found"}
            loading={loading}
          />
        </Grid.Col>
      </Grid>

      <div>
        <FilterBar activeCount={activeFilters} onReset={clearFilters}>
          <TextInput
            aria-label="Search brands"
            placeholder="Search brands"
            radius="xl"
            leftSection={<IconSearch size={16} aria-hidden />}
            rightSection={
              search ? (
                <CloseButton
                  size="sm"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    pushSearch.cancel();
                    setParams({ q: null });
                  }}
                />
              ) : null
            }
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              pushSearch(event.currentTarget.value);
            }}
            style={{ flex: "1 1 240px" }}
            maw={380}
          />
          <Select
            aria-label="Sort brands"
            radius="xl"
            w={220}
            data={SORT_OPTIONS}
            value={sort}
            allowDeselect={false}
            onChange={(value) => setParams({ sort: value && value !== "name" ? value : null })}
          />
        </FilterBar>

        {error && !data ? (
          <QueryError error={error} onRetry={() => void mutate()} permission={PERMISSIONS.PRODUCTS_READ} title="We couldn't load the brands" />
        ) : loading ? (
          <SimpleGrid type="container" cols={{ base: 1, "520px": 2, "820px": 3, "1100px": 4 }} spacing="md">
            {Array.from({ length: 8 }, (_, index) => (
              <BrandCardSkeleton key={index} />
            ))}
          </SimpleGrid>
        ) : visible.length === 0 ? (
          <EmptyState
            color="secondaryGreen"
            icon={<IconTags stroke={1.6} />}
            title={brands.length === 0 ? "No brands yet" : "No brands match your search"}
            description={brands.length === 0 ? "Set a brand when you add or edit a product and it will appear here." : "Try a shorter name."}
            action={
              activeFilters > 0 ? (
                <Button variant="light" color="secondaryGreen" radius="xl" onClick={clearFilters}>
                  Clear search
                </Button>
              ) : undefined
            }
          />
        ) : (
          <SimpleGrid type="container" cols={{ base: 1, "520px": 2, "820px": 3, "1100px": 4 }} spacing="md" aria-label="Brands">
            {visible.map((brand) => (
              <BrandCard
                key={brand.name}
                brand={brand}
                index={brands.indexOf(brand)}
                maxSold={maxSold}
                similar={similar.get(brand.name)}
                canWrite={canWrite}
                onRename={(selected) => setParams({ brand: selected.name })}
              />
            ))}
          </SimpleGrid>
        )}
      </div>

      {canWrite ? <RenameBrandModal brand={renaming} brands={brands} onClose={() => setParams({ brand: null })} /> : null}
    </Stack>
  );
}
