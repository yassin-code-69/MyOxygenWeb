"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActionIcon, Box, Group, Skeleton, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconGift, IconLayoutGrid, IconMapPin } from "@tabler/icons-react";
import { ImageWithFallback } from "./ImageWithFallback";
import { SearchForm } from "./storefront/SearchForm";
import { useScrolledPast } from "./storefront/use-scrolled-past";
import { getCategoryVisual, rankShowcaseCategories } from "./storefront/category-visuals";
import { useCategories } from "../hooks/catalog/use-categories";
import classes from "./storefront/MobileHeader.module.css";

/** Routes where the category strip helps browsing (hidden on product, checkout, account pages). */
function showsCategoryStrip(pathname: string): boolean {
  return pathname === "/" || pathname === "/products" || pathname.startsWith("/categories/");
}

function CategoryStrip({ pathname }: { pathname: string }) {
  const { categories, isLoaded } = useCategories();
  const items = rankShowcaseCategories(categories);

  if (isLoaded && items.length === 0) {
    return null;
  }

  return (
    <Box component="nav" hiddenFrom="sm" aria-label="Shop by category" className={classes.strip}>
      {isLoaded
        ? items.map((category, index) => {
            const visual = getCategoryVisual(category, index);
            const Glyph = visual.glyph;
            const href = `/categories/${category.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={category.id}
                href={href}
                className={classes.stripItem}
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
              >
                <Box className={classes.stripIcon} bg={`${visual.accent}.0`} c={`${visual.accent}.8`}>
                  {visual.icon ? (
                    <ImageWithFallback src={visual.icon} alt="" width={30} height={30} />
                  ) : (
                    <Glyph size={24} stroke={1.8} aria-hidden />
                  )}
                </Box>
                <span className={classes.stripLabel}>{category.name}</span>
              </Link>
            );
          })
        : Array.from({ length: 5 }, (_, index) => (
            <div key={index} className={classes.stripItem} aria-hidden>
              <Skeleton circle height={52} />
              <Skeleton height={10} width={48} radius="xl" />
            </div>
          ))}
    </Box>
  );
}

/**
 * Mobile storefront header (< 768px), SPECIFICATION §4.
 *
 * - Peach top bar: delivery location label (Dhaka) and a Rewards entry. There is no
 *   points programme in the backend, so Rewards shows NO balance and is disabled with
 *   a "coming soon" tooltip.
 * - Sticky floating search pill (submits to `/products?q=`) with the grid action → `/products`.
 *   The camera (image search) icon was removed: no image-search backend exists.
 * - Circular category strip from `GET /catalog/categories` → `/categories/[slug]`.
 */
export function MobileHeader() {
  const pathname = usePathname();
  const scrolled = useScrolledPast(50);

  return (
    <>
      <Box hiddenFrom="sm" className={classes.topBar}>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <span className={classes.location}>
            <IconMapPin size={16} stroke={2} color="var(--mo-color-text-brand)" aria-hidden />
            <Text component="span" inherit truncate="end">
              Dhaka, Bangladesh
            </Text>
          </span>
          <Tooltip label="Reward points are coming soon" events={{ hover: true, focus: true, touch: true }}>
            <UnstyledButton className={classes.reward} aria-disabled="true" aria-label="Rewards (coming soon)">
              <IconGift size={14} stroke={2} aria-hidden />
              Rewards
            </UnstyledButton>
          </Tooltip>
        </Group>
      </Box>

      {/* Sibling of the page content (not nested) so `position: sticky` spans the whole page. */}
      <Box hiddenFrom="sm" className={classes.searchRow} data-scrolled={scrolled || undefined}>
        <ActionIcon
          component={Link}
          href="/products"
          size={42}
          radius="xl"
          variant="white"
          color="primaryPink"
          className={classes.gridAction}
          aria-label="Browse all products"
        >
          <IconLayoutGrid size={20} stroke={1.8} />
        </ActionIcon>
        <SearchForm className={classes.search} size="md" withSubmit={false} />
      </Box>

      {showsCategoryStrip(pathname) ? <CategoryStrip pathname={pathname} /> : null}
    </>
  );
}
