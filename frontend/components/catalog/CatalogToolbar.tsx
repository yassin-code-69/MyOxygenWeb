"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActionIcon, Badge, Button, Group, Pill, Select, Skeleton, Text, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconAdjustmentsHorizontal, IconSearch, IconX } from "@tabler/icons-react";
import { formatBDT } from "../../lib/format";
import { countActiveFilters, effectiveSort, type CatalogFilters } from "./catalog-filters";
import type { CatalogFacets, CatalogSort } from "../../types/catalog";
import classes from "./CatalogExplorer.module.css";

const SEARCH_DEBOUNCE_MS = 300;

const SORT_LABELS: Record<CatalogSort, string> = {
  relevance: "Best match",
  newest: "Newest arrivals",
  popular: "Best sellers",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

// ---------------------------------------------------------------------------
// Debounced search bound to `q`
// ---------------------------------------------------------------------------

function ExplorerSearch({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (q: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [debounced] = useDebouncedValue(draft, SEARCH_DEBOUNCE_MS);
  // Last value this input sent (or adopted) — tells our own commits apart from
  // external changes (navbar search, back/forward, "clear all").
  const committed = useRef(value);

  useEffect(() => {
    const next = debounced.trim();
    if (next === committed.current) {
      return;
    }
    committed.current = next;
    onCommit(next);
  }, [debounced]);

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  const clear = () => {
    setDraft("");
    committed.current = "";
    onCommit("");
  };

  return (
    <TextInput
      type="search"
      variant="search"
      size="sm"
      className={classes.search}
      aria-label="Search products"
      placeholder={placeholder}
      value={draft}
      maxLength={100}
      enterKeyHint="search"
      onChange={(event) => setDraft(event.currentTarget.value)}
      leftSection={<IconSearch size={16} stroke={1.8} aria-hidden />}
      rightSection={
        draft ? (
          <ActionIcon variant="subtle" color="gray" size="sm" radius="xl" onClick={clear} aria-label="Clear search">
            <IconX size={14} />
          </ActionIcon>
        ) : null
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export interface CatalogToolbarProps {
  title: ReactNode;
  filters: CatalogFilters;
  total: number;
  /** True while the current query has no result yet. */
  isLoading: boolean;
  searchPlaceholder: string;
  onSearch: (q: string) => void;
  onSortChange: (sort: CatalogSort) => void;
  onOpenFilters: () => void;
}

/** Results heading + count, debounced search, sort menu and the mobile "Filters" button. */
export function CatalogToolbar({
  title,
  filters,
  total,
  isLoading,
  searchPlaceholder,
  onSearch,
  onSortChange,
  onOpenFilters,
}: CatalogToolbarProps) {
  const sort = effectiveSort(filters);
  const sortOptions = (filters.q.trim() ? (["relevance"] as CatalogSort[]) : []).concat([
    "newest",
    "popular",
    "price_asc",
    "price_desc",
  ]);
  const activeCount = countActiveFilters(filters);

  return (
    <Group justify="space-between" align="flex-end" gap="md" mb="md" wrap="wrap">
      <div>
        <h2 className={classes.toolbarTitle}>{title}</h2>
        <div aria-live="polite">
          {isLoading ? (
            <Skeleton height={14} width={110} radius="xl" mt={6} />
          ) : (
            <Text size="xs" c="dimmed" fw={500} mt={4} className="mo-tabular-nums">
              {total === 1 ? "1 product found" : `${total} products found`}
            </Text>
          )}
        </div>
      </div>

      <Group gap="xs" wrap="wrap" style={{ flex: "1 1 320px" }} justify="flex-end">
        <ExplorerSearch value={filters.q} placeholder={searchPlaceholder} onCommit={onSearch} />
        <Select
          aria-label="Sort products"
          size="sm"
          radius="xl"
          w={190}
          allowDeselect={false}
          checkIconPosition="right"
          value={sort}
          data={sortOptions.map((value) => ({ value, label: SORT_LABELS[value] }))}
          onChange={(value) => {
            if (value) {
              onSortChange(value as CatalogSort);
            }
          }}
          comboboxProps={{ shadow: "dropdown" }}
        />
        <Button
          hiddenFrom="md"
          variant="outline"
          color="primaryPink"
          size="sm"
          onClick={onOpenFilters}
          leftSection={<IconAdjustmentsHorizontal size={16} aria-hidden />}
          rightSection={
            activeCount > 0 ? (
              <Badge size="sm" circle color="primaryPink.8">
                {activeCount}
              </Badge>
            ) : null
          }
        >
          Filters
        </Button>
      </Group>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Active filter chips
// ---------------------------------------------------------------------------

export interface ActiveFilterChipsProps {
  filters: CatalogFilters;
  facets: CatalogFacets | undefined;
  /** Hide the category chip (category landing pages). */
  hideCategory?: boolean;
  onChange: (patch: Partial<CatalogFilters>) => void;
  onClearAll: () => void;
}

/** Removable pills for every applied filter, plus "Clear all". */
export function ActiveFilterChips({ filters, facets, hideCategory = false, onChange, onClearAll }: ActiveFilterChipsProps) {
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];

  if (filters.q.trim()) {
    chips.push({ key: "q", label: `“${filters.q.trim()}”`, remove: () => onChange({ q: "" }) });
  }
  if (!hideCategory && filters.category) {
    const name = facets?.categories.find((facet) => facet.slug === filters.category)?.name ?? filters.category;
    chips.push({ key: "category", label: name, remove: () => onChange({ category: null }) });
  }
  for (const brand of filters.brands) {
    chips.push({
      key: `brand:${brand}`,
      label: brand,
      remove: () => onChange({ brands: filters.brands.filter((value) => value !== brand) }),
    });
  }
  if (filters.minPrice !== null || filters.maxPrice !== null) {
    const label =
      filters.minPrice !== null && filters.maxPrice !== null
        ? `${formatBDT(filters.minPrice)} – ${formatBDT(filters.maxPrice)}`
        : filters.minPrice !== null
          ? `From ${formatBDT(filters.minPrice)}`
          : `Up to ${formatBDT(filters.maxPrice)}`;
    chips.push({ key: "price", label, remove: () => onChange({ minPrice: null, maxPrice: null }) });
  }
  if (filters.inStockOnly) {
    chips.push({ key: "stock", label: "In stock", remove: () => onChange({ inStockOnly: false }) });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <Group gap={8} mb="md" wrap="wrap" aria-label="Active filters" role="group">
      {chips.map((chip) => (
        <Pill
          key={chip.key}
          withRemoveButton
          onRemove={chip.remove}
          removeButtonProps={{ "aria-label": `Remove filter ${chip.label}` }}
          size="md"
          bg="var(--mo-color-surface-brand-tint)"
          c="var(--mo-color-text-brand)"
          fw={600}
        >
          {chip.label}
        </Pill>
      ))}
      <Button variant="subtle" color="gray" size="compact-sm" onClick={onClearAll}>
        Clear all
      </Button>
    </Group>
  );
}
