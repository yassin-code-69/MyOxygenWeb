"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Container, Menu, ScrollArea, Text, UnstyledButton } from "@mantine/core";
import { IconCategory2, IconChevronDown } from "@tabler/icons-react";
import { CartDrawer } from "./CartDrawer";
import { ImageWithFallback } from "./ImageWithFallback";
import { MobileHeader } from "./MobileHeader";
import { AccountMenu } from "./storefront/AccountMenu";
import { CartButton } from "./storefront/CartButton";
import { SearchForm } from "./storefront/SearchForm";
import { useScrolledPast } from "./storefront/use-scrolled-past";
import { rankShowcaseCategories } from "./storefront/category-visuals";
import { useCategories } from "../hooks/catalog/use-categories";
import classes from "./storefront/Navbar.module.css";

function CategoriesMenu({ active }: { active: boolean }) {
  const { categories, isLoaded } = useCategories();
  const items = rankShowcaseCategories(categories);

  return (
    <Menu position="bottom-start" width={260} withinPortal trigger="click-hover" openDelay={80} closeDelay={150}>
      <Menu.Target>
        <UnstyledButton className={classes.navLink} data-active={active || undefined}>
          Categories
          <IconChevronDown size={14} stroke={2.2} aria-hidden />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} href="/products" leftSection={<IconCategory2 size={16} aria-hidden />}>
          All products
        </Menu.Item>
        <Menu.Divider />
        <ScrollArea.Autosize mah={320} type="auto">
          {!isLoaded ? (
            <Menu.Item disabled>Loading categories…</Menu.Item>
          ) : (
            items.map((category) => (
              <Menu.Item
                key={category.id}
                component={Link}
                href={`/categories/${category.slug}`}
                rightSection={
                  <Text size="xs" c="dimmed" className={classes.menuCount}>
                    {category.productCount}
                  </Text>
                }
              >
                {category.name}
              </Menu.Item>
            ))
          )}
        </ScrollArea.Autosize>
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * Storefront header.
 *
 * - < 768px: `MobileHeader` (peach bar, sticky search pill, category strip) + the global
 *   `MobileBottomNav` mounted in `app/layout.tsx`.
 * - >= 768px: this desktop/tablet header — logo, links, pill search (→ `/products?q=`),
 *   cart badge (opens the drawer) and the account menu. It turns frosted with a shadow
 *   after 50px of scroll. There is navigation at every width (no 768–991px gap).
 */
export function Navbar() {
  const pathname = usePathname();
  const scrolled = useScrolledPast(50);

  const isHome = pathname === "/";
  const isShop = pathname === "/products" || pathname.startsWith("/products/");
  const isCategory = pathname.startsWith("/categories/");

  return (
    <>
      <MobileHeader />

      <Box component="header" visibleFrom="sm" className={classes.header} data-scrolled={scrolled || undefined}>
        <Container size="xl" className={classes.inner}>
          <Link href="/" className={classes.brand} aria-label="My Oxygen — home">
            <ImageWithFallback src="/icons/logo-heart.svg" alt="" width={40} height={40} loading="eager" />
            <Box visibleFrom="md">
              <div className={classes.brandName}>My Oxygen</div>
              <div className={classes.brandTagline}>Healthy Life • Happy You</div>
            </Box>
          </Link>

          <nav aria-label="Main" className={classes.nav}>
            <Box
              component={Link}
              href="/"
              visibleFrom="md"
              className={classes.navLink}
              data-active={isHome || undefined}
              aria-current={isHome ? "page" : undefined}
            >
              Home
            </Box>
            <Link
              href="/products"
              className={classes.navLink}
              data-active={isShop || undefined}
              aria-current={pathname === "/products" ? "page" : undefined}
            >
              Shop
            </Link>
            <CategoriesMenu active={isCategory} />
          </nav>

          <SearchForm className={classes.search} size="sm" />

          <div className={classes.actions}>
            <CartButton />
            <AccountMenu />
          </div>
        </Container>
      </Box>

      <CartDrawer />
    </>
  );
}
