"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AppShell,
  Burger,
  Group,
  Text,
  Badge,
  ActionIcon,
  Tooltip,
  Menu,
  Avatar,
  UnstyledButton,
  Drawer,
  Stack,
  Divider,
  Box,
  ThemeIcon,
  rem,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconLayoutDashboard,
  IconTruckDelivery,
  IconCalendarTime,
  IconFileSpreadsheet,
  IconArrowBackUp,
  IconBell,
  IconShieldCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconLogout,
  IconAlertTriangle,
  IconClock,
  IconCheck,
  IconBuildingStore,
  IconPackage,
  IconReceipt,
} from "@tabler/icons-react";

interface NavItemConfig {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    label: "Overview",
    href: "/admin",
    icon: IconLayoutDashboard,
    exact: true,
  },
  {
    label: "Orders",
    href: "/admin/orders",
    icon: IconTruckDelivery,
    badge: "Live",
    badgeColor: "#4CAF7D",
  },
  {
    label: "Invoices",
    href: "/admin/invoices",
    icon: IconReceipt,
  },
  {
    label: "Products Catalog",
    href: "/admin/products",
    icon: IconPackage,
  },
  {
    label: "Batch Inspector",
    href: "/admin/batches",
    icon: IconCalendarTime,
    badge: "FEFO",
    badgeColor: "#FF6B8B",
  },
  {
    label: "Stock Ledger",
    href: "/admin/ledger",
    icon: IconFileSpreadsheet,
  },
  {
    label: "Return to Store",
    href: "/",
    icon: IconArrowBackUp,
    exact: true,
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileOpened, { open: openMobile, close: closeMobile }] = useDisclosure(false);

  const isLinkActive = (item: NavItemConfig) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("my_oxygen_token");
        localStorage.removeItem("my_oxygen_user");
      } catch (err) {
        console.error("Logout cleanup error:", err);
      }
    }
    router.push("/");
  };

  // Brand Header component
  const BrandHeader = ({ collapsed = false }: { collapsed?: boolean }) => (
    <Link
      href="/admin"
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "block",
        width: "100%",
      }}
    >
      <Group
        gap="xs"
        style={{
          justifyContent: collapsed ? "center" : "flex-start",
          width: "100%",
          padding: "4px 8px",
        }}
      >
        <ThemeIcon
          size={collapsed ? 36 : 38}
          radius="md"
          style={{
            background: "linear-gradient(135deg, #FF6B8B 0%, #FFA8BA 100%)",
            boxShadow: "0 2px 8px rgba(255, 107, 139, 0.3)",
            flexShrink: 0,
          }}
        >
          <IconShieldCheck size={20} color="#FFFFFF" stroke={2.2} />
        </ThemeIcon>

        {!collapsed && (
          <Box style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
            <Group gap={6} align="center">
              <Text fw={750} size="md" c="#1F2937" style={{ letterSpacing: "-0.3px" }}>
                My Oxygen
              </Text>
              <Badge
                size="xs"
                variant="filled"
                radius="sm"
                style={{
                  backgroundColor: "#FF6B8B",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}
              >
                Admin
              </Badge>
            </Group>
            <Text size="11px" c="#9CA3AF" fw={500}>
              Store Control Center
            </Text>
          </Box>
        )}
      </Group>
    </Link>
  );

  // Navigation Items Renderer
  const renderNavLinks = (collapsed: boolean, onItemClick?: () => void) => (
    <Stack gap={6} style={{ width: "100%" }}>
      {NAV_ITEMS.map((item) => {
        const active = isLinkActive(item);
        const IconComponent = item.icon;

        const content = (
          <UnstyledButton
            key={item.href}
            component={Link}
            href={item.href}
            onClick={onItemClick}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "space-between",
              padding: collapsed ? "10px 0" : "10px 14px",
              borderRadius: "10px",
              backgroundColor: active
                ? "rgba(255, 107, 139, 0.1)"
                : "transparent",
              color: active ? "#FF6B8B" : "#4B5563",
              fontWeight: active ? 650 : 500,
              fontSize: rem(14),
              transition: "all 0.18s ease",
              border: active
                ? "1px solid rgba(255, 107, 139, 0.25)"
                : "1px solid transparent",
              position: "relative",
              textDecoration: "none",
            }}
            styles={{
              root: {
                "&:hover": {
                  backgroundColor: active
                    ? "rgba(255, 107, 139, 0.14)"
                    : "rgba(0, 0, 0, 0.04)",
                  color: active ? "#FF6B8B" : "#1F2937",
                },
              },
            }}
          >
            <Group gap="xs" wrap="nowrap" style={{ overflow: "hidden" }}>
              <ThemeIcon
                size={32}
                radius="md"
                variant={active ? "light" : "subtle"}
                color={active ? "pink" : "gray"}
                style={{
                  backgroundColor: active
                    ? "rgba(255, 107, 139, 0.18)"
                    : "transparent",
                  color: active ? "#FF6B8B" : "#6B7280",
                  flexShrink: 0,
                }}
              >
                <IconComponent size={18} stroke={active ? 2.2 : 1.8} />
              </ThemeIcon>

              {!collapsed && (
                <Text
                  size="sm"
                  fw={active ? 650 : 500}
                  style={{
                    color: active ? "#FF6B8B" : "#374151",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </Text>
              )}
            </Group>

            {!collapsed && item.badge && (
              <Badge
                size="xs"
                variant="light"
                radius="xl"
                style={{
                  backgroundColor: `${item.badgeColor || "#FF6B8B"}18`,
                  color: item.badgeColor || "#FF6B8B",
                  fontWeight: 700,
                  fontSize: "10px",
                }}
              >
                {item.badge}
              </Badge>
            )}
          </UnstyledButton>
        );

        if (collapsed) {
          return (
            <Tooltip
              key={item.href}
              label={item.label}
              position="right"
              withArrow
              transitionProps={{ transition: "fade", duration: 150 }}
            >
              <div>{content}</div>
            </Tooltip>
          );
        }

        return content;
      })}
    </Stack>
  );

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{
        width: desktopCollapsed ? 76 : 260,
        breakpoint: "sm",
        collapsed: { mobile: true },
      }}
      padding="lg"
      style={{
        backgroundColor: "#FFF8F6",
        minHeight: "100vh",
      }}
    >
      {/* Top Bar */}
      <AppShell.Header
        style={{
          backgroundColor: "#FFFFFF",
          borderBottom: "1px solid #FEE2E2",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
          zIndex: 100,
        }}
      >
        <Group h="100%" px="md" justify="space-between" align="center">
          {/* Left section: Hamburger / Collapse / Breadcrumb */}
          <Group gap="sm">
            {/* Mobile Hamburger Drawer Trigger */}
            <Burger
              opened={mobileOpened}
              onClick={openMobile}
              hiddenFrom="sm"
              size="sm"
              color="#4B5563"
              aria-label="Open mobile navigation"
            />

            {/* Desktop Sidebar Collapse Toggle */}
            <Tooltip
              label={desktopCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              position="bottom"
              visibleFrom="sm"
            >
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                radius="md"
                visibleFrom="sm"
                onClick={() => setDesktopCollapsed((prev) => !prev)}
                aria-label="Toggle sidebar width"
              >
                {desktopCollapsed ? (
                  <IconChevronRight size={18} />
                ) : (
                  <IconChevronLeft size={18} />
                )}
              </ActionIcon>
            </Tooltip>

            {/* Mobile Brand Title */}
            <Box hiddenFrom="sm">
              <Group gap={6} align="center">
                <Text fw={700} size="sm" c="#1F2937">
                  My Oxygen
                </Text>
                <Badge
                  size="xs"
                  variant="filled"
                  radius="xs"
                  style={{ backgroundColor: "#FF6B8B" }}
                >
                  Admin
                </Badge>
              </Group>
            </Box>

            {/* Desktop Portal Context */}
            <Box visibleFrom="sm" style={{ paddingLeft: 4 }}>
              <Text size="xs" fw={600} c="#9CA3AF" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Back-Office Management
              </Text>
            </Box>
          </Group>

          {/* Right section: Role Badge, Notifications, User Profile Chip */}
          <Group gap="sm" align="center">
            {/* Role indicator badge (SUPER_ADMIN in #FF6B8B) */}
            <Badge
              variant="light"
              radius="xl"
              size="md"
              style={{
                backgroundColor: "rgba(255, 107, 139, 0.12)",
                color: "#FF6B8B",
                border: "1px solid rgba(255, 107, 139, 0.35)",
                fontWeight: 750,
                letterSpacing: "0.6px",
                padding: "6px 12px",
                textTransform: "uppercase",
              }}
            >
              SUPER_ADMIN
            </Badge>

            {/* Notification Bell with Menu */}
            <Menu shadow="md" width={320} position="bottom-end" withArrow>
              <Menu.Target>
                <ActionIcon
                  variant="light"
                  size="lg"
                  radius="md"
                  aria-label="System notifications"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.03)",
                    color: "#4B5563",
                    position: "relative",
                  }}
                >
                  <IconBell size={19} stroke={1.8} />
                  {/* Unread badge dot */}
                  <Box
                    style={{
                      position: "absolute",
                      top: 7,
                      right: 7,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: "#FF6B8B",
                      border: "2px solid #FFFFFF",
                    }}
                  />
                </ActionIcon>
              </Menu.Target>

              <Menu.Dropdown p="xs">
                <Group justify="space-between" mb="xs" px="xs">
                  <Text size="sm" fw={700} c="#1F2937">
                    Notifications
                  </Text>
                  <Badge size="xs" variant="light" color="pink">
                    3 New
                  </Badge>
                </Group>
                <Divider my={4} />

                <Menu.Item
                  component={Link}
                  href="/admin/batches"
                  leftSection={
                    <ThemeIcon color="red" variant="light" size="sm" radius="xl">
                      <IconClock size={14} />
                    </ThemeIcon>
                  }
                >
                  <Text size="xs" fw={600} c="#1F2937">
                    4 Batches Expiring Soon
                  </Text>
                  <Text size="11px" c="dimmed">
                    Shelf-life ≤30 days — FEFO review required
                  </Text>
                </Menu.Item>

                <Menu.Item
                  component={Link}
                  href="/admin/ledger"
                  leftSection={
                    <ThemeIcon color="yellow" variant="light" size="sm" radius="xl">
                      <IconAlertTriangle size={14} />
                    </ThemeIcon>
                  }
                >
                  <Text size="xs" fw={600} c="#1F2937">
                    7 Low Stock Warnings
                  </Text>
                  <Text size="11px" c="dimmed">
                    SKUs hit safety reorder threshold
                  </Text>
                </Menu.Item>

                <Menu.Item
                  component={Link}
                  href="/admin/orders"
                  leftSection={
                    <ThemeIcon color="green" variant="light" size="sm" radius="xl">
                      <IconCheck size={14} />
                    </ThemeIcon>
                  }
                >
                  <Text size="xs" fw={600} c="#1F2937">
                    New Orders Pending
                  </Text>
                  <Text size="11px" c="dimmed">
                    Recent orders ready for packing and dispatch
                  </Text>
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            {/* Admin User Profile Chip */}
            <Menu shadow="md" width={220} position="bottom-end" withArrow>
              <Menu.Target>
                <UnstyledButton
                  style={{
                    padding: "4px 8px 4px 4px",
                    borderRadius: "24px",
                    backgroundColor: "rgba(0, 0, 0, 0.02)",
                    border: "1px solid #F3F4F6",
                    transition: "background 0.15s ease",
                  }}
                  styles={{
                    root: {
                      "&:hover": {
                        backgroundColor: "rgba(0, 0, 0, 0.05)",
                      },
                    },
                  }}
                >
                  <Group gap="xs" wrap="nowrap">
                    <Avatar
                      radius="xl"
                      size={32}
                      style={{
                        backgroundColor: "#FF6B8B",
                        color: "#FFFFFF",
                        fontWeight: 700,
                        fontSize: "13px",
                      }}
                    >
                      SO
                    </Avatar>
                    <Box visibleFrom="xs" style={{ textAlign: "left", lineHeight: 1.1 }}>
                      <Text size="xs" fw={700} c="#1F2937">
                        Store Owner
                      </Text>
                      <Text size="10px" c="#6B7280">
                        admin@myoxygen.com
                      </Text>
                    </Box>
                    <IconChevronDown size={14} color="#9CA3AF" />
                  </Group>
                </UnstyledButton>
              </Menu.Target>

              <Menu.Dropdown p="xs">
                <Box p="xs">
                  <Text size="xs" fw={700} c="#1F2937">
                    Super Admin Account
                  </Text>
                  <Text size="11px" c="#6B7280">
                    Single Owner Portal
                  </Text>
                </Box>
                <Divider my={4} />

                <Menu.Item
                  component={Link}
                  href="/admin"
                  leftSection={<IconLayoutDashboard size={15} />}
                >
                  Admin Overview
                </Menu.Item>

                <Menu.Item
                  component={Link}
                  href="/"
                  leftSection={<IconBuildingStore size={15} />}
                >
                  Storefront View
                </Menu.Item>

                <Divider my={4} />

                <Menu.Item
                  color="red"
                  leftSection={<IconLogout size={15} />}
                  onClick={handleLogout}
                >
                  Log Out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      {/* Desktop Collapsible Sidebar */}
      <AppShell.Navbar
        p="md"
        style={{
          backgroundColor: "#FFFFFF",
          borderRight: "1px solid #FEE2E2",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          transition: "width 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 99,
        }}
      >
        <Stack gap="md" style={{ width: "100%" }}>
          {/* Header Brand */}
          <BrandHeader collapsed={desktopCollapsed} />

          <Divider color="#FEE2E2" />

          {/* Nav items */}
          {renderNavLinks(desktopCollapsed)}
        </Stack>

        {/* Sidebar Footer */}
        <Box style={{ width: "100%" }} pt="md">
          <Divider color="#FEE2E2" mb="sm" />
          <UnstyledButton
            component={Link}
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: desktopCollapsed ? "center" : "flex-start",
              gap: 10,
              padding: "8px 10px",
              borderRadius: "8px",
              color: "#6B7280",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 500,
              transition: "all 0.15s ease",
            }}
          >
            <ThemeIcon size={28} radius="md" variant="light" color="gray">
              <IconBuildingStore size={16} />
            </ThemeIcon>
            {!desktopCollapsed && (
              <Box>
                <Text size="xs" fw={600} c="#374151">
                  Customer Storefront
                </Text>
                <Text size="10px" c="#9CA3AF">
                  Back to live shopping
                </Text>
              </Box>
            )}
          </UnstyledButton>
        </Box>
      </AppShell.Navbar>

      {/* Responsive Mobile Drawer */}
      <Drawer
        opened={mobileOpened}
        onClose={closeMobile}
        size={290}
        padding="md"
        hiddenFrom="sm"
        title={<BrandHeader collapsed={false} />}
        styles={{
          header: {
            borderBottom: "1px solid #FEE2E2",
            paddingBottom: "12px",
          },
          body: {
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "calc(100% - 64px)",
            paddingTop: "16px",
          },
        }}
      >
        <Stack gap="xs" style={{ flex: 1 }}>
          <Text size="xs" fw={700} c="#9CA3AF" px="xs" style={{ textTransform: "uppercase" }}>
            Navigation
          </Text>
          {renderNavLinks(false, closeMobile)}
        </Stack>

        <Box pt="md">
          <Divider color="#FEE2E2" mb="md" />
          <Group justify="space-between" align="center" px="xs" mb="sm">
            <Group gap="xs">
              <Avatar
                radius="xl"
                size={32}
                style={{ backgroundColor: "#FF6B8B", color: "#FFFFFF", fontWeight: 700 }}
              >
                SO
              </Avatar>
              <Box>
                <Text size="xs" fw={700} c="#1F2937">
                  Store Owner
                </Text>
                <Badge
                  size="xs"
                  variant="light"
                  style={{
                    backgroundColor: "rgba(255, 107, 139, 0.12)",
                    color: "#FF6B8B",
                  }}
                >
                  SUPER_ADMIN
                </Badge>
              </Box>
            </Group>

            <ActionIcon
              variant="subtle"
              color="red"
              size="md"
              radius="md"
              onClick={() => {
                closeMobile();
                handleLogout();
              }}
              title="Logout"
            >
              <IconLogout size={16} />
            </ActionIcon>
          </Group>
        </Box>
      </Drawer>

      {/* Main Content Area */}
      <AppShell.Main
        style={{
          backgroundColor: "#FFF8F6",
          minHeight: "calc(100vh - 64px)",
        }}
      >
        <Box style={{ maxWidth: 1400, margin: "0 auto" }}>{children}</Box>
      </AppShell.Main>
    </AppShell>
  );
}
