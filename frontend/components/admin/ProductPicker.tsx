"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Group, Loader, Select, Stack, Text, type SelectProps } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useProductOptions } from "../../hooks/admin/use-admin-products";
import type { AdminListingStatus, AdminProductDTO } from "../../types/admin";

/** The minimum needed to show a selected product before the search results load. */
export interface ProductOption {
  id: string;
  title: string;
  sku: string;
  listingStatus?: AdminListingStatus;
}

const STATUS_TEXT: Record<AdminListingStatus, string> = {
  ACTIVE: "Live",
  AWAITING_STOCK: "Awaiting stock",
  INACTIVE: "Inactive",
};

export interface ProductPickerProps {
  value: string | null;
  onChange: (productId: string | null, product: ProductOption | null) => void;
  label?: ReactNode;
  placeholder?: string;
  description?: ReactNode;
  error?: ReactNode;
  withAsterisk?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  /** Label source for a preselected product (e.g. from a deep link). */
  initialProduct?: ProductOption | null;
  w?: SelectProps["w"];
  radius?: SelectProps["radius"];
}

/**
 * Searchable product select backed by `GET /admin/catalog/products` (server-side
 * search, every listing status — new products awaiting stock and inactive ones
 * included). Works for catalogs of any size.
 */
export function ProductPicker({
  value,
  onChange,
  label = "Product",
  placeholder = "Search by title or SKU",
  description,
  error,
  withAsterisk,
  clearable = false,
  disabled,
  initialProduct = null,
  w,
  radius,
}: ProductPickerProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProductOption | null>(initialProduct);
  const known = selected && selected.id === value ? selected : initialProduct && initialProduct.id === value ? initialProduct : null;
  // When the input just shows the chosen product's title, list everything instead of searching for it.
  const query = known && search === known.title ? "" : search;
  const [debouncedQuery] = useDebouncedValue(query, 250);
  const { data, isLoading, isValidating } = useProductOptions(debouncedQuery, !disabled);

  const byId = useMemo(() => {
    const map = new Map<string, ProductOption>();
    for (const product of data?.items ?? []) {
      map.set(product.id, toOption(product));
    }
    if (known && !map.has(known.id)) {
      map.set(known.id, known);
    }
    return map;
  }, [data, known]);

  const options = useMemo(
    () => [...byId.values()].map((product) => ({ value: product.id, label: product.title })),
    [byId],
  );

  const searching = isLoading || (isValidating && debouncedQuery !== "");

  return (
    <Select
      label={label}
      placeholder={placeholder}
      description={description}
      error={error}
      withAsterisk={withAsterisk}
      clearable={clearable}
      disabled={disabled}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      data={options}
      value={value}
      onChange={(id) => {
        const product = id ? (byId.get(id) ?? null) : null;
        setSelected(product);
        onChange(id, product);
      }}
      filter={({ options: items }) => items}
      nothingFoundMessage={searching ? "Searching…" : "No products found"}
      rightSection={searching ? <Loader size={14} /> : undefined}
      maxDropdownHeight={300}
      w={w}
      radius={radius}
      renderOption={({ option }) => {
        const product = byId.get(option.value);
        return (
          <Stack gap={0}>
            <Text size="sm" fw={500} lineClamp={1}>
              {option.label}
            </Text>
            {product ? (
              <Group gap={6}>
                <Text size="xs" c="dimmed" ff="var(--mo-font-monospace)">
                  {product.sku}
                </Text>
                {product.listingStatus && product.listingStatus !== "ACTIVE" ? (
                  <Text size="xs" c="var(--mo-color-text-warning)">
                    · {STATUS_TEXT[product.listingStatus]}
                  </Text>
                ) : null}
              </Group>
            ) : null}
          </Stack>
        );
      }}
    />
  );
}

function toOption(product: AdminProductDTO): ProductOption {
  return { id: product.id, title: product.title, sku: product.sku, listingStatus: product.listingStatus };
}
