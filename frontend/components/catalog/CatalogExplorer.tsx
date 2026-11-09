"use client";

import { useRef } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Anchor, Box, Breadcrumbs, Container, Drawer, Grid, Group, Skeleton, Stack, Text } from "@mantine/core";
import { useDisclosure, useReducedMotion } from "@mantine/hooks";
import { IconChevronRight, IconRefresh } from "@tabler/icons-react";
import { BrandButton } from "../BrandButton";
import { EmptyState } from "../EmptyState";
import { ProductCardSkeleton } from "../ProductCardSkeleton";
import { ProductsHeroBanner } from "../ProductsHeroBanner";
import { CatalogFilters, type CategoryMode } from "./CatalogFilters";
import { CatalogPagination } from "./CatalogPagination";
import { CatalogProductGrid } from "./CatalogProductGrid";
import { ActiveFilterChips, CatalogToolbar } from "./CatalogToolbar";
import { hasAnyFilter, serializeCatalogFilters, toProductsQuery } from "./catalog-filters";
import { getCategoryVisual, humanizeSlug } from "../storefront/category-visuals";
import { isApiError } from "../../lib/api-client";
import { CATALOG_PAGE_SIZE, useProducts } from "../../hooks/use-products";
import { useAddToCart } from "../../hooks/catalog/use-add-to-cart";
import { useCatalogFilters } from "../../hooks/catalog/use-catalog-filters";
import { useCategories } from "../../hooks/catalog/use-categories";
import type { CatalogFacets } from "../../types/catalog";
import classes from "./CatalogExplorer.module.css";

/** Shown in the sidebar when the very first request failed (instead of an endless skeleton). */
const EMPTY_FACETS: CatalogFacets = { brands: [], categories: [], priceRange: null };

export interface CatalogExplorerProps {
  /** Category landing page: the category is fixed by the route (`/categories/[slug]`). */
  categorySlug?: string;
}

function ExplorerBreadcrumbs({ categoryName }: { categoryName: string | null }) {
  return (
    <Breadcrumbs
      separator={<IconChevronRight size={13} color="var(--mo-color-icon-muted)" aria-hidden />}
      mb="md"
      aria-label="Breadcrumb"
    >
      <Anchor component={Link} href="/" size="xs" c="dimmed">
        Home
      </Anchor>
      {categoryName ? (
        <Anchor component={Link} href="/products" size="xs" c="dimmed">
          Shop
        </Anchor>
      ) : (
        <Text size="xs" fw={600} c="var(--mo-color-text-brand)" aria-current="page">
          Shop
        </Text>
      )}
      {categoryName ? (
        <Text size="xs" fw={600} c="var(--mo-color-text-brand)" aria-current="page">
          {categoryName}
        </Text>
      ) : null}
    </Breadcrumbs>
  );
}

/**
 * The catalog explorer shared by `/products` and `/categories/[slug]`:
 * live facets (categories, brands, price range) from `GET /catalog/products`, debounced
 * search bound to `q`, sort, server pagination, URL-synced state, skeletons, retryable
 * errors, a mobile filter drawer and a 2-column phone grid.
 *
 * Uses `useSearchParams` — render inside `<Suspense fallback={<CatalogExplorerFallback />}>`.
 */
export function CatalogExplorer({ categorySlug }: CatalogExplorerProps) {
  const lockCategory = Boolean(categorySlug);
  const { filters, updateFilters, setPage, resetFilters } = useCatalogFilters({ lockCategory });
  const query = toProductsQuery(filters, { lockedCategory: categorySlug ?? null, limit: CATALOG_PAGE_SIZE });
  const { products, meta, facets, total, isLoading, error, mutate } = useProducts(query, { keepPreviousData: true });
  const { categories } = useCategories();
  const addToCart = useAddToCart();
  const [drawerOpened, drawer] = useDisclosure(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Unknown (404) or malformed (422) category slug → the not-found page.
  if (categorySlug && isApiError(error) && (error.status === 404 || error.status === 422)) {
    notFound();
  }

  const activeSlug = categorySlug ?? filters.category;
  const category = activeSlug ? categories.find((entry) => entry.slug === activeSlug) : undefined;
  const categoryName = activeSlug
    ? (category?.name ?? facets?.categories.find((facet) => facet.slug === activeSlug)?.name ?? humanizeSlug(activeSlug))
    : null;
  const visual = activeSlug ? getCategoryVisual({ slug: activeSlug, iconUrl: category?.iconUrl }) : null;

  // `/products?category=<unknown>`: explain and offer to drop the category filter.
  const unknownCategory =
    !categorySlug && filters.category !== null && isApiError(error) && (error.status === 404 || error.status === 422);
  const sidebarFacets = facets ?? (error ? EMPTY_FACETS : undefined);

  const categoryMode: CategoryMode = categorySlug ? { kind: "link", activeSlug: categorySlug } : { kind: "filter" };
  const filtered = hasAnyFilter(filters);
  const pageOutOfRange = !isLoading && meta !== undefined && meta.totalPages > 0 && filters.page > meta.totalPages;
  const resultKey = `${categorySlug ?? ""}?${serializeCatalogFilters(filters, { lockCategory })}`;

  const toolbarTitle = filters.q.trim() ? `Results for “${filters.q.trim()}”` : (categoryName ?? "All products");

  const changePage = (page: number) => {
    setPage(page);
    resultsRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  const clearAll = () => resetFilters({ includeSearch: true });

  const filterPanel = (
    <CatalogFilters
      filters={filters}
      facets={sidebarFacets}
      categoryMode={categoryMode}
      onChange={(patch) => updateFilters(patch)}
      onReset={() => resetFilters()}
    />
  );

  return (
    <Container size="xl" py="lg">
      <ExplorerBreadcrumbs categoryName={categoryName} />

      <ProductsHeroBanner
        title={categoryName ?? "All Products"}
        eyebrow={visual?.tagline ?? undefined}
        description={
          visual?.description ??
          (category ? `Browse ${category.productCount} ${category.productCount === 1 ? "product" : "products"} in ${category.name}.` : undefined)
        }
        imageSrc={visual?.image}
        imageAlt={visual?.image && categoryName ? `${categoryName} products` : undefined}
      />

      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 3 }} visibleFrom="md">
          <aside aria-label="Product filters" className={classes.sidebar}>
            {filterPanel}
          </aside>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 9 }}>
          <div ref={resultsRef} className={classes.results}>
            <CatalogToolbar
              title={toolbarTitle}
              filters={filters}
              total={total}
              isLoading={isLoading}
              searchPlaceholder={categoryName ? `Search in ${categoryName}…` : "Search products…"}
              onSearch={(q) => updateFilters({ q })}
              onSortChange={(sort) => updateFilters({ sort })}
              onOpenFilters={drawer.open}
            />

            <ActiveFilterChips
              filters={filters}
              facets={facets}
              hideCategory={lockCategory}
              onChange={(patch) => updateFilters(patch)}
              onClearAll={clearAll}
            />

            {unknownCategory ? (
              <EmptyState
                title="Category not found"
                description="This category does not exist or is no longer available."
                action={<BrandButton onClick={() => updateFilters({ category: null })}>Show all products</BrandButton>}
              />
            ) : pageOutOfRange ? (
              <EmptyState
                title="This page is empty"
                description={`There are only ${meta?.totalPages ?? 0} pages of results.`}
                action={<BrandButton onClick={() => changePage(1)}>Go to the first page</BrandButton>}
              />
            ) : (
              <CatalogProductGrid
                products={products}
                isLoading={isLoading}
                error={error}
                pageSize={CATALOG_PAGE_SIZE}
                resultKey={resultKey}
                hideCategory={lockCategory}
                onRetry={() => {
                  void mutate();
                }}
                onAddToCart={(product) => {
                  addToCart(product);
                }}
                emptyDescription={
                  filtered
                    ? "Try a different search or adjust the filters."
                    : "There are no products here yet — new arrivals are on their way."
                }
                emptyAction={
                  filtered ? (
                    <BrandButton variant="outline" leftSection={<IconRefresh size={16} aria-hidden />} onClick={clearAll}>
                      Clear search &amp; filters
                    </BrandButton>
                  ) : (
                    <BrandButton component={Link} href="/products" variant="outline">
                      Browse all products
                    </BrandButton>
                  )
                }
              />
            )}

            {/* Stays mounted while the next page loads (previous meta) so the layout does not jump. */}
            {!pageOutOfRange && !unknownCategory && (!error || products.length > 0) ? (
              <CatalogPagination meta={meta} page={filters.page} onChange={changePage} />
            ) : null}
          </div>
        </Grid.Col>
      </Grid>

      <Drawer
        opened={drawerOpened}
        onClose={drawer.close}
        position="left"
        size="min(88vw, 360px)"
        title={
          <Text fw={800} size="lg" c="var(--mo-color-text)">
            Filters
          </Text>
        }
      >
        {filterPanel}
        <div className={classes.drawerFooter}>
          <BrandButton fullWidth onClick={drawer.close}>
            {isLoading ? "Show results" : `Show ${total} ${total === 1 ? "product" : "products"}`}
          </BrandButton>
        </div>
      </Drawer>
    </Container>
  );
}

/** Suspense fallback with the same layout as the loaded explorer (zero CLS). */
export function CatalogExplorerFallback({ title = "All Products" }: { title?: string }) {
  return (
    <Container size="xl" py="lg" aria-busy="true">
      <Group gap={8} mb="md" h={20} aria-hidden>
        <Skeleton height={12} width={40} radius="xl" />
        <Skeleton height={12} width={48} radius="xl" />
      </Group>
      <ProductsHeroBanner title={title} />
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 3 }} visibleFrom="md">
          <Box className={classes.sidebar} aria-hidden>
            <Stack gap="xl">
              {[6, 2, 5].map((rows, section) => (
                <Stack key={section} gap={10}>
                  <Skeleton height={18} width="50%" radius="xl" />
                  {Array.from({ length: rows }, (_, index) => (
                    <Skeleton key={index} height={16} radius="xl" width={`${90 - index * 6}%`} />
                  ))}
                </Stack>
              ))}
            </Stack>
          </Box>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 9 }}>
          <Group justify="space-between" mb="md" aria-hidden>
            <Stack gap={6}>
              <Skeleton height={26} width={180} radius="xl" />
              <Skeleton height={14} width={110} radius="xl" />
            </Stack>
            <Group gap="xs">
              <Skeleton height={36} width={220} radius="xl" />
              <Skeleton height={36} width={190} radius="xl" />
            </Group>
          </Group>
          <div className={classes.grid} aria-hidden>
            <ProductCardSkeleton count={CATALOG_PAGE_SIZE} />
          </div>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
