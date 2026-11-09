"use client";

import Link from "next/link";
import { Avatar, Group, Menu, Skeleton, Text, UnstyledButton } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconLogout, IconReceipt2, IconShieldLock, IconUser } from "@tabler/icons-react";
import { BrandButton } from "../BrandButton";
import { selectIsStaff, useAuthStore } from "../../lib/auth-store";
import { DevAdminLoginButton } from "./DevAdminLoginButton";

/** Session state that is safe to render: `"pending"` until the persisted session is restored on the client. */
export function useSessionStatus(): "pending" | "signed-in" | "signed-out" {
  const mounted = useMounted();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated && state.user !== null);
  if (!mounted || !hasHydrated) {
    return "pending";
  }
  return isAuthenticated ? "signed-in" : "signed-out";
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0]?.[0] ?? "?");
  return letters.toUpperCase();
}

/**
 * Header account area: a placeholder while the session hydrates (no Login/Avatar
 * flicker), the Login button when signed out, or the user menu (My Orders, Admin for
 * staff, Logout). In development it also offers the one-click Dev Admin login.
 */
export function AccountMenu() {
  const status = useSessionStatus();
  const user = useAuthStore((state) => state.user);
  const isStaff = useAuthStore(selectIsStaff);
  const logout = useAuthStore((state) => state.logout);

  if (status === "pending") {
    return <Skeleton height={36} width={96} radius="xl" aria-hidden />;
  }

  const devShortcut = DevAdminLoginButton && !isStaff ? <DevAdminLoginButton /> : null;

  if (status === "signed-out" || !user) {
    return (
      <Group gap="xs" wrap="nowrap">
        {devShortcut}
        <BrandButton component={Link} href="/login" size="sm" leftSection={<IconUser size={16} aria-hidden />}>
          Login
        </BrandButton>
      </Group>
    );
  }

  const firstName = user.fullName.trim().split(/\s+/)[0] ?? user.fullName;

  const handleLogout = () => {
    logout();
    notifications.show({
      title: "Signed out",
      message: "See you again soon.",
      color: "secondaryGreen",
      autoClose: 2500,
    });
  };

  return (
    <Group gap="xs" wrap="nowrap">
      {devShortcut}
      <Menu position="bottom-end" width={220} withinPortal>
        <Menu.Target>
          <UnstyledButton aria-label={`Account menu for ${user.fullName}`}>
            <Group gap={8} wrap="nowrap">
              <Avatar color="primaryPink" radius="xl" size={34} variant="light">
                {initials(user.fullName)}
              </Avatar>
              <Text size="sm" fw={600} c="var(--mo-color-text)" visibleFrom="md" maw={110} truncate="end">
                {firstName}
              </Text>
              <IconChevronDown size={14} stroke={2} color="var(--mo-color-text-muted)" aria-hidden />
            </Group>
          </UnstyledButton>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Label>
            <Text size="xs" c="dimmed">
              Signed in as
            </Text>
            <Text size="sm" fw={600} c="var(--mo-color-text)" truncate="end">
              {user.fullName}
            </Text>
          </Menu.Label>
          <Menu.Divider />
          <Menu.Item component={Link} href="/account" leftSection={<IconUser size={16} aria-hidden />}>
            My Account
          </Menu.Item>
          <Menu.Item component={Link} href="/orders" leftSection={<IconReceipt2 size={16} aria-hidden />}>
            My Orders
          </Menu.Item>
          {isStaff ? (
            <Menu.Item component={Link} href="/admin" leftSection={<IconShieldLock size={16} aria-hidden />}>
              Admin
            </Menu.Item>
          ) : null}
          <Menu.Divider />
          <Menu.Item color="danger.8" leftSection={<IconLogout size={16} aria-hidden />} onClick={handleLogout}>
            Logout
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
