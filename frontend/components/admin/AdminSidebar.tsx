"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Divider, NavLink, ScrollArea, Stack, Text } from "@mantine/core";
import { IconArrowUpRight, IconBuildingStore } from "@tabler/icons-react";
import { isAdminNavItemActive, type AdminNavItem } from "../../lib/admin-nav";

export interface AdminSidebarProps {
  items: readonly AdminNavItem[];
  /** Called after a link is followed (closes the mobile drawer). */
  onNavigate?: () => void;
}

/** Permission-filtered back-office navigation. */
export function AdminSidebar({ items, onNavigate }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <Stack gap="md" h="100%" justify="space-between">
      <ScrollArea.Autosize mah="100%" type="auto" offsetScrollbars>
        <Box component="nav" aria-label="Back-office">
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" px="sm" mb={6} style={{ letterSpacing: "0.06em" }}>
            Workspace
          </Text>
          <Stack gap={4}>
            {items.map((item) => {
              const active = isAdminNavItemActive(item, pathname);
              const ItemIcon = item.icon;
              return (
                <NavLink
                  key={item.href}
                  component={Link}
                  href={item.href}
                  onClick={onNavigate}
                  active={active}
                  aria-current={active ? "page" : undefined}
                  label={item.label}
                  description={item.description}
                  leftSection={<ItemIcon size={20} stroke={1.8} aria-hidden />}
                  variant="light"
                  color="primaryPink"
                  styles={{
                    root: { borderRadius: "var(--mo-radius-md)" },
                    label: { fontWeight: 600 },
                    description: { fontSize: "var(--mantine-font-size-xs)" },
                  }}
                />
              );
            })}
          </Stack>
        </Box>
      </ScrollArea.Autosize>

      <Box>
        <Divider mb="sm" color="var(--mo-color-border-subtle)" />
        <NavLink
          component={Link}
          href="/"
          onClick={onNavigate}
          label="Back to the storefront"
          leftSection={<IconBuildingStore size={20} stroke={1.8} aria-hidden />}
          rightSection={<IconArrowUpRight size={16} aria-hidden />}
          styles={{ root: { borderRadius: "var(--mo-radius-md)" } }}
        />
      </Box>
    </Stack>
  );
}
