"use client";

import { useMemo } from "react";
import { ActionIcon, Box, Burger, Divider, Group, Kbd, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import type { AuthUser } from "../../lib/auth-store";
import { AdminAlerts } from "./AdminAlerts";
import { AdminBrand } from "./AdminBrand";
import { adminSpotlight } from "./AdminCommandPalette";
import { AdminUserMenu } from "./AdminUserMenu";
import classes from "./AdminShell.module.css";

export interface AdminHeaderProps {
  user: AuthUser;
  homeHref: string;
  navOpened: boolean;
  onToggleNav: () => void;
  onLogout: () => void;
}

/**
 * Top bar: pill search (opens the Ctrl/⌘ K palette), notifications bell and
 * profile menu. Phones get a burger, the heart mark and a search icon.
 */
export function AdminHeader({ user, homeHref, navOpened, onToggleNav, onLogout }: AdminHeaderProps) {
  // The shell renders only after mount, so reading the platform here is safe.
  const shortcut = useMemo(() => (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘ K" : "Ctrl K"), []);

  return (
    <Group h="100%" px={{ base: "sm", sm: "lg" }} justify="space-between" wrap="nowrap" gap="sm">
      <Group gap="sm" wrap="nowrap" style={{ flex: "1 1 auto", minWidth: 0 }}>
        <Burger
          opened={navOpened}
          onClick={onToggleNav}
          hiddenFrom="md"
          size="sm"
          aria-label={navOpened ? "Close navigation" : "Open navigation"}
        />
        <Box hiddenFrom="md" style={{ flex: "0 0 auto" }}>
          <AdminBrand href={homeHref} compact />
        </Box>
        <UnstyledButton
          className={classes.searchTrigger}
          visibleFrom="sm"
          onClick={adminSpotlight.open}
          aria-haspopup="dialog"
          aria-label={`Search products, orders and customers (${shortcut.replace(" ", " + ")})`}
        >
          <IconSearch size={18} stroke={1.8} aria-hidden />
          <span className={classes.searchText}>Search products, orders, customers…</span>
          <Kbd size="xs" aria-hidden>
            {shortcut}
          </Kbd>
        </UnstyledButton>
      </Group>
      <Group gap={6} wrap="nowrap" style={{ flex: "0 0 auto" }}>
        <ActionIcon
          hiddenFrom="sm"
          variant="subtle"
          color="gray"
          size={42}
          radius="xl"
          aria-label="Search products, orders and customers"
          aria-haspopup="dialog"
          onClick={adminSpotlight.open}
        >
          <IconSearch size={20} stroke={1.8} aria-hidden />
        </ActionIcon>
        <AdminAlerts />
        <Divider orientation="vertical" visibleFrom="sm" h={32} my="auto" mx={6} color="var(--mo-color-border)" />
        <AdminUserMenu user={user} onLogout={onLogout} />
      </Group>
    </Group>
  );
}
