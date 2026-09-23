"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Group, Text, Badge, UnstyledButton } from "@mantine/core";
import {
  IconHome,
  IconCategory,
  IconShoppingBag,
  IconHeart,
  IconUser,
  IconShieldLock,
} from "@tabler/icons-react";
import { useCartStore } from "../lib/cart-store";
import { useAuthStore } from "../lib/auth-store";
import { myOxygenColors } from "../tokens";

export function MobileBottomNav() {
  const pathname = usePathname();
  const totalCount = useCartStore((state) => state.totalCount());
  const openDrawer = useCartStore((state) => state.openDrawer);
  const { user, isAuthenticated } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Do not display on full-screen admin back-office pages
  if (pathname.startsWith("/admin")) {
    return null;
  }

  const items = [
    {
      label: "Home",
      href: "/",
      icon: IconHome,
      isActive: pathname === "/",
    },
    {
      label: "Catalog",
      href: "/products",
      icon: IconCategory,
      isActive: pathname.startsWith("/products") || pathname.startsWith("/categories"),
    },
    {
      label: "Cart",
      isAction: true,
      onClick: () => openDrawer(),
      icon: IconShoppingBag,
      badge: mounted && totalCount > 0 ? totalCount : null,
      isActive: false,
    },
    {
      label: "Wishlist",
      href: "/products",
      icon: IconHeart,
      isActive: false,
    },
    {
      label: isAuthenticated ? (user?.role === "SUPER_ADMIN" ? "Admin" : "Account") : "Login",
      href: isAuthenticated ? (user?.role === "SUPER_ADMIN" ? "/admin" : "/login") : "/login",
      icon: user?.role === "SUPER_ADMIN" ? IconShieldLock : IconUser,
      isActive: pathname === "/login" || pathname === "/register",
    },
  ];

  return (
    <Box
      component="nav"
      aria-label="Mobile Navigation Bar"
      style={{
        display: "block",
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid #FFE4EC",
        boxShadow: "0 -4px 20px rgba(255, 107, 139, 0.08)",
        paddingBottom: "env(safe-area-inset-bottom, 6px)",
      }}
      className="mobile-bottom-nav-wrapper"
    >
      <Group justify="space-around" align="center" py={8} px={6} gap={0} wrap="nowrap">
        {items.map((item) => {
          const Icon = item.icon;
          const activeColor = myOxygenColors.primaryPink;
          const inactiveColor = "#9CA3AF";
          const color = item.isActive ? activeColor : inactiveColor;

          const content = (
            <Box
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                padding: "4px 8px",
                borderRadius: "12px",
                transition: "all 150ms ease",
              }}
            >
              <Box style={{ position: "relative" }}>
                <Icon size={22} color={color} stroke={item.isActive ? 2.3 : 1.7} />
                {item.badge ? (
                  <Badge
                    size="xs"
                    circle
                    color="pink"
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -8,
                      backgroundColor: myOxygenColors.primaryPink,
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {item.badge}
                  </Badge>
                ) : null}
              </Box>
              <Text
                size="10px"
                mt={2}
                fw={item.isActive ? 700 : 500}
                c={item.isActive ? myOxygenColors.primaryPink : "#6B7280"}
                style={{ letterSpacing: "-0.01em" }}
              >
                {item.label}
              </Text>
            </Box>
          );

          if (item.isAction) {
            return (
              <UnstyledButton key={item.label} onClick={item.onClick} style={{ textAlign: "center" }}>
                {content}
              </UnstyledButton>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href!}
              style={{ textDecoration: "none", textAlign: "center" }}
            >
              {content}
            </Link>
          );
        })}
      </Group>

      <style jsx global>{`
        @media (min-width: 768px) {
          .mobile-bottom-nav-wrapper {
            display: none !important;
          }
        }
      `}</style>
    </Box>
  );
}
