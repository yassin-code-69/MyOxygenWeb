"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge, Box, UnstyledButton } from "@mantine/core";
import {
  IconBuildingStore,
  IconHome,
  IconReceipt2,
  IconShoppingBag,
  IconUser,
  type Icon,
} from "@tabler/icons-react";
import { useCartStore } from "../lib/cart-store";
import { useCartCount } from "./storefront/CartButton";
import { useSessionStatus } from "./storefront/AccountMenu";
import classes from "./storefront/MobileBottomNav.module.css";

interface NavLinkItem {
  kind: "link";
  label: string;
  href: string;
  icon: Icon;
  active: boolean;
}

interface NavActionItem {
  kind: "action";
  label: string;
  icon: Icon;
  active: boolean;
  onClick: () => void;
  badge: number;
}

type NavItem = NavLinkItem | NavActionItem;

function ItemContent({ item, badge }: { item: NavItem; badge?: number }) {
  const IconComponent = item.icon;
  return (
    <>
      <span className={classes.iconWrap}>
        <IconComponent className={classes.icon} size={22} stroke={item.active ? 2.2 : 1.7} aria-hidden />
        {badge && badge > 0 ? (
          <Badge size="xs" circle color="primaryPink.8" className={classes.badge} aria-hidden>
            {badge > 99 ? "99+" : badge}
          </Badge>
        ) : null}
      </span>
      <span>{item.label}</span>
    </>
  );
}

/**
 * Fixed bottom navigation for phones (< 768px), mounted ONCE in `app/layout.tsx`.
 * Hidden on `/admin`. Home · Shop · Cart (opens the drawer, live badge) · Orders · Account
 * (`/account` when signed in, `/login` otherwise).
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const cartCount = useCartCount();
  const isDrawerOpen = useCartStore((state) => state.isDrawerOpen);
  const openDrawer = useCartStore((state) => state.openDrawer);
  const session = useSessionStatus();

  if (pathname.startsWith("/admin")) {
    return null;
  }

  const signedIn = session === "signed-in";
  const items: NavItem[] = [
    { kind: "link", label: "Home", href: "/", icon: IconHome, active: pathname === "/" },
    {
      kind: "link",
      label: "Shop",
      href: "/products",
      icon: IconBuildingStore,
      active: pathname.startsWith("/products") || pathname.startsWith("/categories"),
    },
    {
      kind: "action",
      label: "Cart",
      icon: IconShoppingBag,
      active: isDrawerOpen,
      onClick: openDrawer,
      badge: cartCount,
    },
    {
      kind: "link",
      label: "Orders",
      href: "/orders",
      icon: IconReceipt2,
      active: pathname.startsWith("/orders"),
    },
    {
      // Stable label (no text flicker while the session hydrates); signed out → login.
      kind: "link",
      label: "Account",
      href: signedIn ? "/account" : "/login",
      icon: IconUser,
      active: pathname.startsWith("/account") || pathname === "/login" || pathname === "/register",
    },
  ];

  return (
    <Box component="nav" hiddenFrom="sm" aria-label="Mobile navigation" className={`${classes.root} mo-glass`}>
      <ul className={classes.list}>
        {items.map((item) => (
          <li key={item.label}>
            {item.kind === "action" ? (
              <UnstyledButton
                className={classes.item}
                data-active={item.active || undefined}
                onClick={item.onClick}
                aria-haspopup="dialog"
                aria-label={item.badge > 0 ? `${item.label}, ${item.badge} items` : item.label}
              >
                <ItemContent item={item} badge={item.badge} />
              </UnstyledButton>
            ) : (
              <Link
                href={item.href}
                className={classes.item}
                data-active={item.active || undefined}
                aria-current={item.active ? "page" : undefined}
              >
                <ItemContent item={item} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Box>
  );
}
