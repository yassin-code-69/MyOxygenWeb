"use client";

import Link from "next/link";
import { Avatar, Badge, Box, Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { IconBuildingStore, IconChevronDown, IconLogout } from "@tabler/icons-react";
import type { AuthUser } from "../../lib/auth-store";
import { initialsOf, roleLabel } from "./format";

export interface AdminUserMenuProps {
  user: AuthUser;
  onLogout: () => void;
}

/** Signed-in staff member (real name, initials and role) with logout. */
export function AdminUserMenu({ user, onLogout }: AdminUserMenuProps) {
  return (
    <Menu position="bottom-end" width={260} withinPortal>
      <Menu.Target>
        <UnstyledButton
          aria-label={`Account menu for ${user.fullName}`}
          style={{ borderRadius: "var(--mo-radius-xl)", padding: "4px 8px 4px 4px" }}
        >
          <Group gap="xs" wrap="nowrap">
            <Avatar color="primaryPink" radius="xl" size={34}>
              {initialsOf(user.fullName)}
            </Avatar>
            <Box visibleFrom="sm" style={{ minWidth: 0 }}>
              <Text size="sm" fw={600} lh={1.2} truncate maw={160}>
                {user.fullName}
              </Text>
              <Text size="xs" c="dimmed" lh={1.2}>
                {roleLabel(user.role)}
              </Text>
            </Box>
            <IconChevronDown size={14} aria-hidden />
          </Group>
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
          <Badge mt={6} size="sm" variant="light" color="accentPurple">
            {roleLabel(user.role)}
          </Badge>
        </Box>
        <Menu.Divider />
        <Menu.Item component={Link} href="/" leftSection={<IconBuildingStore size={16} aria-hidden />}>
          View storefront
        </Menu.Item>
        <Menu.Item color="danger" leftSection={<IconLogout size={16} aria-hidden />} onClick={onLogout}>
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
