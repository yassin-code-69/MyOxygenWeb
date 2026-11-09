"use client";

import Link from "next/link";
import { Avatar, Badge, Box, Menu, Text, UnstyledButton } from "@mantine/core";
import { IconBuildingStore, IconChevronDown, IconLogout, IconUserCircle } from "@tabler/icons-react";
import type { AuthUser } from "../../lib/auth-store";
import { initialsOf, roleLabel } from "./format";
import classes from "./AdminShell.module.css";

export interface AdminUserMenuProps {
  user: AuthUser;
  onLogout: () => void;
}

/** Signed-in staff member (initials avatar, real name, role) with account links and logout. */
export function AdminUserMenu({ user, onLogout }: AdminUserMenuProps) {
  return (
    <Menu position="bottom-end" width={260} withinPortal offset={8}>
      <Menu.Target>
        <UnstyledButton className={classes.profileButton} aria-label={`Account menu for ${user.fullName}`}>
          <Avatar
            radius="xl"
            size={38}
            styles={{
              placeholder: {
                backgroundColor: "var(--mo-color-primary-1)",
                color: "var(--mo-color-primary-9)",
                fontWeight: 700,
              },
            }}
          >
            {initialsOf(user.fullName)}
          </Avatar>
          <Box visibleFrom="sm" style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} lh={1.25} truncate maw={170} c="var(--mo-color-text)">
              {user.fullName}
            </Text>
            <Text size="xs" c="var(--mo-color-text-muted)" lh={1.3}>
              {roleLabel(user.role)}
            </Text>
          </Box>
          <IconChevronDown size={16} color="var(--mo-color-text-muted)" aria-hidden />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Box px="sm" py="xs">
          <Text size="sm" fw={600} truncate>
            {user.fullName}
          </Text>
          {user.email ? (
            <Text size="xs" c="dimmed" truncate>
              {user.email}
            </Text>
          ) : null}
          <Badge mt={6} size="sm" variant="light" color="accentPurple" tt="none">
            {roleLabel(user.role)}
          </Badge>
        </Box>
        <Menu.Divider />
        <Menu.Item component={Link} href="/account" leftSection={<IconUserCircle size={16} aria-hidden />}>
          My account
        </Menu.Item>
        <Menu.Item component={Link} href="/" leftSection={<IconBuildingStore size={16} aria-hidden />}>
          View storefront
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item color="danger" leftSection={<IconLogout size={16} aria-hidden />} onClick={onLogout}>
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
