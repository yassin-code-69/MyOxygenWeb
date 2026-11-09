"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  Anchor,
  Button,
  Checkbox,
  Group,
  RangeSlider,
  Skeleton,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronRight, IconLayoutGrid, IconRefresh, type Icon } from "@tabler/icons-react";
import { formatBDT } from "../../lib/format";
import { getCategoryVisual, rankShowcaseCategories } from "../storefront/category-visuals";
import { useCategories } from "../../hooks/catalog/use-categories";
import { countActiveFilters, type CatalogFilters as CatalogFilterState } from "./catalog-filters";
import type { CatalogBrandFacet, CatalogCategoryFacet, CatalogFacets, CatalogPriceRange } from "../../types/catalog";
import classes from "./CatalogExplorer.module.css";

const VISIBLE_CATEGORIES = 6;
const VISIBLE_BRANDS = 5;

/** How the category list behaves: filter in place (`/products`) or link to category pages. */
export type CategoryMode = { kind: "filter" } | { kind: "link"; activeSlug: string };

export interface CatalogFiltersProps {
  filters: CatalogFilterState;
  /** `undefined` until the first response arrives (skeleton rows are shown). */
  facets: CatalogFacets | undefined;
  categoryMode: CategoryMode;
  onChange: (patch: Partial<CatalogFilterState>) => void;
  onReset: () => void;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function CategoryRow({
  label,
  count,
  active,
  glyph: Glyph,
  href,
  onSelect,
}: {
  label: string;
  count?: number;
  active: boolean;
  glyph: Icon;
  href?: string;
  onSelect?: () => void;
}) {
  const content = (
    <>
      <span className={classes.categoryLabel}>
        <Glyph size={18} stroke={1.8} className={classes.categoryIcon} aria-hidden />
        <span className={classes.categoryName}>{label}</span>
      </span>
      <Group gap={4} wrap="nowrap">
        {typeof count === "number" ? <span className={classes.count}>({count})</span> : null}
        <IconChevronRight size={14} className={classes.categoryIcon} aria-hidden />
      </Group>
    </>
  );

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={classes.categoryRow}
          data-active={active || undefined}
          aria-current={active ? "page" : undefined}
        >
          {content}
        </Link>
      ) : (
        <UnstyledButton
          className={classes.categoryRow}
          data-active={active || undefined}
          aria-pressed={active}
          onClick={onSelect}
        >
          {content}
        </UnstyledButton>
      )}
    </li>
  );
}

function CategorySection({
  facets,
  filters,
  mode,
  onChange,
}: {
  facets: CatalogCategoryFacet[];
  filters: CatalogFilterState;
  mode: CategoryMode;
  onChange: CatalogFiltersProps["onChange"];
}) {
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const { categories } = useCategories();

  // Same order as the rest of the storefront (owner order, categories with artwork first).
  const rank = new Map(rankShowcaseCategories(categories).map((category, index) => [category.slug, index]));
  const ordered = [...facets].sort(
    (a, b) => (rank.get(a.slug) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.slug) ?? Number.MAX_SAFE_INTEGER)
  );
  const activeSlug = mode.kind === "link" ? mode.activeSlug : filters.category;
  const visible = expanded
    ? ordered
    : ordered.filter((facet, index) => index < VISIBLE_CATEGORIES || facet.slug === activeSlug);
  const hiddenCount = ordered.length - visible.length;

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className={classes.sectionTitle}>
        Categories
      </h3>
      <ul className={classes.categoryList}>
        <CategoryRow
          label="All products"
          glyph={IconLayoutGrid}
          active={activeSlug === null}
          href={mode.kind === "link" ? "/products" : undefined}
          onSelect={() => onChange({ category: null })}
        />
        {visible.map((facet, index) => (
          <CategoryRow
            key={facet.id}
            label={facet.name}
            count={facet.count}
            glyph={getCategoryVisual(facet, index).glyph}
            active={facet.slug === activeSlug}
            href={mode.kind === "link" ? `/categories/${facet.slug}` : undefined}
            onSelect={() => onChange({ category: facet.slug === filters.category ? null : facet.slug })}
          />
        ))}
      </ul>
      {hiddenCount > 0 || expanded ? (
        <Anchor component="button" type="button" size="xs" fw={600} mt={8} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show fewer categories" : `Show all categories (${ordered.length})`}
        </Anchor>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------

function priceStep(range: CatalogPriceRange): number {
  const span = range.max - range.min;
  if (span <= 500) {
    return 10;
  }
  if (span <= 5000) {
    return 50;
  }
  return 100;
}

function PriceSection({
  range,
  minPrice,
  maxPrice,
  onChange,
}: {
  range: CatalogPriceRange;
  minPrice: number | null;
  maxPrice: number | null;
  onChange: CatalogFiltersProps["onChange"];
}) {
  const headingId = useId();
  const step = priceStep(range);
  const lower = Math.floor(range.min / step) * step;
  const upper = Math.max(lower + step, Math.ceil(range.max / step) * step);
  const clamp = (value: number) => Math.min(upper, Math.max(lower, value));
  const [draft, setDraft] = useState<[number, number]>([clamp(minPrice ?? lower), clamp(maxPrice ?? upper)]);

  const commit = ([from, to]: [number, number]) => {
    onChange({ minPrice: from <= lower ? null : from, maxPrice: to >= upper ? null : to });
  };

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className={classes.sectionTitle}>
        Price range
      </h3>
      <RangeSlider
        min={lower}
        max={upper}
        step={step}
        minRange={step}
        value={draft}
        onChange={setDraft}
        onChangeEnd={commit}
        label={(value) => formatBDT(value)}
        color="primaryPink"
        size="sm"
        thumbFromLabel="Minimum price"
        thumbToLabel="Maximum price"
        mb="md"
        mx={4}
      />
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <span className={classes.priceBox}>{formatBDT(draft[0])}</span>
        <Text size="xs" c="dimmed">
          to
        </Text>
        <span className={classes.priceBox}>{formatBDT(draft[1])}</span>
      </Group>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

function BrandSection({
  facets,
  selected,
  onChange,
}: {
  facets: CatalogBrandFacet[];
  selected: string[];
  onChange: CatalogFiltersProps["onChange"];
}) {
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const known = new Set(facets.map((facet) => facet.value.toLowerCase()));
  // Keep selected brands visible (with 0) even when the other filters exclude them.
  const options: CatalogBrandFacet[] = [
    ...facets,
    ...selected.filter((brand) => !known.has(brand.toLowerCase())).map((brand) => ({ value: brand, count: 0 })),
  ];
  const isSelected = (brand: string) => selected.some((value) => value.toLowerCase() === brand.toLowerCase());
  const visible = expanded ? options : options.filter((option, index) => index < VISIBLE_BRANDS || isSelected(option.value));
  const hiddenCount = options.length - visible.length;

  const toggle = (brand: string) => {
    onChange({
      brands: isSelected(brand)
        ? selected.filter((value) => value.toLowerCase() !== brand.toLowerCase())
        : [...selected, brand],
    });
  };

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className={classes.sectionTitle}>
        Brand
      </h3>
      {options.length === 0 ? (
        <Text size="xs" c="dimmed">
          No brands for the current results.
        </Text>
      ) : (
        <Stack gap={10}>
          {visible.map((option) => (
            <Group key={option.value} justify="space-between" wrap="nowrap" gap="xs">
              <Checkbox
                size="xs"
                label={option.value}
                checked={isSelected(option.value)}
                onChange={() => toggle(option.value)}
                styles={{ label: { fontSize: "0.8125rem", fontWeight: 500, color: "var(--mo-color-text-strong)" } }}
              />
              <span className={classes.count}>({option.count})</span>
            </Group>
          ))}
        </Stack>
      )}
      {hiddenCount > 0 || expanded ? (
        <Anchor component="button" type="button" size="xs" fw={600} mt={10} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show fewer brands" : `Show all brands (${options.length})`}
        </Anchor>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function FiltersSkeleton() {
  return (
    <Stack gap="xl" aria-hidden>
      {[6, 2, 5].map((rows, section) => (
        <Stack key={section} gap={10}>
          <Skeleton height={18} width="50%" radius="xl" />
          {Array.from({ length: rows }, (_, index) => (
            <Skeleton key={index} height={16} radius="xl" width={`${90 - index * 6}%`} />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * Explorer filters (desktop sidebar and mobile drawer): categories, price range bounded
 * by `facets.priceRange`, brands with live facet counts, and an in-stock switch.
 * No rating filters — the catalog has no rating data.
 */
export function CatalogFilters({ filters, facets, categoryMode, onChange, onReset }: CatalogFiltersProps) {
  const availabilityId = useId();

  if (!facets) {
    return <FiltersSkeleton />;
  }

  const activeCount = countActiveFilters(filters);

  return (
    <Stack gap="xl">
      <CategorySection facets={facets.categories} filters={filters} mode={categoryMode} onChange={onChange} />

      {facets.priceRange ? (
        <PriceSection
          // Re-initialise the draft when the bounds or the committed values change.
          key={`${facets.priceRange.min}:${facets.priceRange.max}:${filters.minPrice}:${filters.maxPrice}`}
          range={facets.priceRange}
          minPrice={filters.minPrice}
          maxPrice={filters.maxPrice}
          onChange={onChange}
        />
      ) : null}

      <BrandSection facets={facets.brands} selected={filters.brands} onChange={onChange} />

      <section aria-labelledby={availabilityId}>
        <h3 id={availabilityId} className={classes.sectionTitle}>
          Availability
        </h3>
        <Switch
          label="In stock only"
          checked={filters.inStockOnly}
          onChange={(event) => onChange({ inStockOnly: event.currentTarget.checked })}
        />
      </section>

      {activeCount > 0 ? (
        <Button
          variant="outline"
          color="primaryPink"
          size="xs"
          fullWidth
          leftSection={<IconRefresh size={14} aria-hidden />}
          onClick={onReset}
        >
          Reset filters ({activeCount})
        </Button>
      ) : null}
    </Stack>
  );
}
