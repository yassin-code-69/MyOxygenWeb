"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Group,
  Container,
  Text,
  Button,
  ActionIcon,
  Badge,
  Indicator,
  Box,
  Menu,
  Avatar,
  UnstyledButton,
  Image,
} from "@mantine/core";
import {
  IconSearch,
  IconHeart,
  IconShoppingBag,
  IconHeartHandshake,
  IconUser,
  IconShieldLock,
  IconLogout,
  IconReceipt2,
  IconSparkles,
} from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";
import { useCartStore } from "../lib/cart-store";
import { useAuthStore } from "../lib/auth-store";
import { CartDrawer } from "./CartDrawer";
import { MobileHeader } from "./MobileHeader";
import { apiPost } from "../lib/api-client";
import { notifications } from "@mantine/notifications";

export function Navbar() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const openDrawer = useCartStore((state) => state.openDrawer);
  const totalCount = useCartStore((state) => state.totalCount());
  const { user, isAuthenticated, setAuth, logout } = useAuthStore();
  const [isLoggingInDev, setIsLoggingInDev] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cartBadgeCount = mounted ? totalCount : 0;

  // 1-Click Dev Super Admin Login Helper
  const handleDevAdminLogin = async () => {
    try {
      setIsLoggingInDev(true);
      const res = await apiPost<{
        success: boolean;
        data: {
          user: { id: string; fullName: string; email: string; phone: string; role: string };
          accessToken: string;
          refreshToken?: string;
        };
        error?: any;
      }>("/auth/login", {
        identifier: "admin@myoxygen.com",
        password: "Admin@MyOxygen2026",
      });

      if (res.success && res.data) {
        setAuth({
          user: res.data.user,
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken,
        });
        notifications.show({
          title: "⚡ Dev Admin Login Successful",
          message: "Authenticated as System Super Admin. Redirecting...",
          color: "teal",
        });
        router.push("/admin");
      } else {
        throw new Error(typeof res.error === "string" ? res.error : "Dev login failed");
      }
    } catch (err: any) {
      notifications.show({
        title: "Login Error",
        message: err.message || "Could not log in as Super Admin",
        color: "red",
      });
    } finally {
      setIsLoggingInDev(false);
    }
  };

  return (
    <>
      {/* Mobile Top Header (Only on mobile < 768px, matching mobile view.jpeg) */}
      <MobileHeader />

      {/* Desktop Main Header (Visible on md and above) */}
      <Box
        component="header"
        visibleFrom="md"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid #FFE4EC",
          position: "sticky",
          top: 0,
          zIndex: 1000,
          boxShadow: "0 4px 20px rgba(255, 107, 139, 0.08)",
        }}
      >
        <Container size="xl" py="sm">
          <Group justify="space-between" align="center">
            {/* Logo */}
            <Link href="/" style={{ cursor: "pointer", textDecoration: "none" }}>
              <Group gap="xs">
                <Box
                  style={{
                    width: 42,
                    height: 42,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Image
                    src="/icons/logo-heart.svg"
                    alt="My Oxygen Logo"
                    w={42}
                    h={42}
                    fit="contain"
                  />
                </Box>
                <Box>
                  <Text
                    fw={800}
                    size="xl"
                    style={{
                      color: myOxygenColors.primaryPink,
                      lineHeight: 1.1,
                      fontFamily: "var(--font-poppins)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    My Oxygen
                  </Text>
                  <Text size="11px" c="dimmed" fw={500} style={{ letterSpacing: "0.02em" }}>
                    Healthy Life • Happy You
                  </Text>
                </Box>
              </Group>
            </Link>

            {/* Navigation Links */}
            <Group gap="xl">
              <Text
                component={Link}
                href="/"
                fw={700}
                size="sm"
                style={{
                  cursor: "pointer",
                  textDecoration: "none",
                  color: myOxygenColors.primaryPink,
                  borderBottom: `2px solid ${myOxygenColors.primaryPink}`,
                  paddingBottom: 2,
                }}
              >
                Home
              </Text>
              <Text
                component={Link}
                href="/products"
                fw={500}
                size="sm"
                c="dimmed"
                style={{ cursor: "pointer", textDecoration: "none", transition: "color 0.2s" }}
              >
                Shop
              </Text>
              <Text
                component={Link}
                href="/categories/newborn"
                fw={500}
                size="sm"
                c="dimmed"
                style={{ cursor: "pointer", textDecoration: "none" }}
              >
                Newborn
              </Text>
              <Text
                component={Link}
                href="/categories/mother-care"
                fw={500}
                size="sm"
                c="dimmed"
                style={{ cursor: "pointer", textDecoration: "none" }}
              >
                Mother Care
              </Text>
              <Text
                component={Link}
                href="/categories/skin-care"
                fw={500}
                size="sm"
                c="dimmed"
                style={{ cursor: "pointer", textDecoration: "none" }}
              >
                Skin Care
              </Text>
              <Text
                component={Link}
                href="/categories/inner-wear"
                fw={500}
                size="sm"
                c="dimmed"
                style={{ cursor: "pointer", textDecoration: "none" }}
              >
                Inner Wear
              </Text>
              <Text
                component={Link}
                href="/products"
                fw={500}
                size="sm"
                c="dimmed"
                style={{ cursor: "pointer", textDecoration: "none" }}
              >
                About Us
              </Text>
            </Group>

            {/* Action Icons, Dev Shortcut & Auth CTA */}
            <Group gap="sm">
              <ActionIcon
                component={Link}
                href="/products"
                variant="subtle"
                color="gray"
                size="lg"
                radius="xl"
                aria-label="Search catalog"
              >
                <IconSearch size={20} />
              </ActionIcon>

              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                radius="xl"
                aria-label="Wishlist"
              >
                <IconHeart size={20} />
              </ActionIcon>

              <Indicator
                label={cartBadgeCount}
                disabled={cartBadgeCount === 0}
                size={18}
                color="pink"
                offset={4}
                withBorder
                styles={{
                  indicator: {
                    backgroundColor: "#FF4D6D !important",
                    color: "#FFFFFF",
                    fontWeight: 700,
                    fontSize: "11px",
                    lineHeight: "18px",
                    padding: 0,
                    minWidth: 18,
                    height: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(255, 77, 109, 0.45)",
                  },
                }}
              >
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  radius="xl"
                  onClick={openDrawer}
                  aria-label={`Shopping cart with ${cartBadgeCount} items`}
                >
                  <IconShoppingBag size={20} />
                </ActionIcon>
              </Indicator>

              {/* User Authentication Menu or Login Button */}
              {mounted && isAuthenticated && user ? (
                <Menu shadow="md" width={200} position="bottom-end">
                  <Menu.Target>
                    <UnstyledButton>
                      <Group gap="xs">
                        <Avatar color="pink" radius="xl" size="sm">
                          {user.fullName.charAt(0).toUpperCase()}
                        </Avatar>
                        <Text size="sm" fw={600} c={myOxygenColors.darkText}>
                          {user.fullName.split(" ")[0]}
                        </Text>
                      </Group>
                    </UnstyledButton>
                  </Menu.Target>

                  <Menu.Dropdown>
                    <Menu.Label>Signed in as</Menu.Label>
                    <Menu.Item disabled>
                      <Text size="xs" fw={700}>
                        {user.phone || user.email}
                      </Text>
                      <Badge size="xs" color="pink" mt={2}>
                        {user.role}
                      </Badge>
                    </Menu.Item>
                    <Menu.Divider />

                    {user.role === "SUPER_ADMIN" && (
                      <Menu.Item
                        leftSection={<IconShieldLock size={16} color={myOxygenColors.primaryPink} />}
                        onClick={() => router.push("/admin")}
                      >
                        Admin Portal
                      </Menu.Item>
                    )}

                    <Menu.Item
                      leftSection={<IconReceipt2 size={16} />}
                      onClick={() => router.push("/products")}
                    >
                      Orders & History
                    </Menu.Item>

                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<IconLogout size={16} />}
                      onClick={logout}
                    >
                      Logout
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              ) : (
                <Button
                  component={Link}
                  href="/login"
                  radius="xl"
                  size="sm"
                  fw={600}
                  style={{
                    backgroundColor: myOxygenColors.primaryPink,
                    color: "#FFFFFF",
                    boxShadow: "0 4px 14px rgba(255, 107, 139, 0.35)",
                    padding: "0 20px",
                    height: 38,
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  Login / Signup
                </Button>
              )}
            </Group>
          </Group>
        </Container>
      </Box>

      {/* Slide-out Cart Drawer */}
      <CartDrawer />
    </>
  );
}
