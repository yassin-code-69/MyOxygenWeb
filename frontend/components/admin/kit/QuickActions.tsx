"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { SimpleGrid, Text } from "@mantine/core";
import { canAccessNavEntry } from "../../../lib/admin-nav";
import { useAdminRole } from "../../../hooks/admin/use-permission";
import type { Permission } from "../../../types/auth";
import { TONES, type KpiTone } from "./tones";
import classes from "./kit.module.css";

export interface QuickAction {
  key: string;
  label: string;
  href: string;
  /** Icon element (18px reads best). */
  icon: ReactNode;
  tone: KpiTone;
  /** Hidden unless the user holds this permission. */
  permission?: Permission;
  /** Hidden unless the user is SUPER_ADMIN. */
  superAdminOnly?: boolean;
}

export interface QuickActionsProps {
  actions: readonly QuickAction[];
  /** Tiles per row. Default 2. */
  cols?: number;
  /** Shown when the role can use none of the actions. */
  emptyText?: string;
}

/**
 * Pastel shortcut tiles (mockup "Quick Actions"). Actions the signed-in role
 * cannot use are not rendered at all.
 *
 * ```tsx
 * <QuickActions actions={[{ key: "add", label: "Add Product", href: "/admin/products?new=1",
 *   icon: <IconPlus size={18} />, tone: "mint", permission: PERMISSIONS.PRODUCTS_WRITE }]} />
 * ```
 */
export function QuickActions({ actions, cols = 2, emptyText = "No shortcuts for your role." }: QuickActionsProps) {
  const role = useAdminRole();
  const allowed = actions.filter((action) =>
    canAccessNavEntry(role, { permission: action.permission, superAdminOnly: action.superAdminOnly }),
  );

  if (allowed.length === 0) {
    return (
      <Text size="sm" c="var(--mo-color-text-muted)">
        {emptyText}
      </Text>
    );
  }

  return (
    <SimpleGrid cols={cols} spacing="sm" verticalSpacing="sm">
      {allowed.map((action) => {
        const tone = TONES[action.tone];
        const vars = {
          "--tile-surface": tone.surface,
          "--tile-border": tone.border,
          "--tile-icon-bg": tone.iconBg,
          "--tile-icon": tone.icon,
        } as CSSProperties;
        return (
          <Link key={action.key} href={action.href} className={classes.tile} style={vars}>
            <span className={classes.tileIcon} aria-hidden>
              {action.icon}
            </span>
            <span>{action.label}</span>
          </Link>
        );
      })}
    </SimpleGrid>
  );
}
