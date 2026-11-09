"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Loader, SimpleGrid, Text, UnstyledButton } from "@mantine/core";
import { useAdminRole } from "../../../hooks/admin/use-permission";
import { canAccessNavEntry } from "../../../lib/admin-nav";
import type { Permission } from "../../../types/auth";
import { TONES, type KpiTone } from "../kit";
import kitClasses from "../kit/kit.module.css";
import classes from "./reports.module.css";

interface ActionTileBase {
  key: string;
  label: string;
  /** 18px icon element. */
  icon: ReactNode;
  tone: KpiTone;
  permission?: Permission;
  superAdminOnly?: boolean;
}

export type ActionTile =
  | (ActionTileBase & { href: string; onClick?: never; busy?: never })
  | (ActionTileBase & { onClick: () => void; href?: never; busy?: boolean });

export interface ActionTilesProps {
  actions: readonly ActionTile[];
  cols?: number;
  emptyText?: string;
}

/**
 * The kit's Quick Actions look, extended with tiles that run an action
 * (e.g. "Generate Report" exports a CSV) instead of navigating. Tiles the
 * role can't use are not rendered.
 */
export function ActionTiles({ actions, cols = 2, emptyText = "No shortcuts for your role." }: ActionTilesProps) {
  const role = useAdminRole();
  const allowed = actions.filter((action) => canAccessNavEntry(role, { permission: action.permission, superAdminOnly: action.superAdminOnly }));
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
        const content = (
          <>
            <span className={kitClasses.tileIcon} aria-hidden>
              {action.busy ? <Loader size={16} color="currentColor" /> : action.icon}
            </span>
            <span>{action.label}</span>
          </>
        );
        if (action.href !== undefined) {
          return (
            <Link key={action.key} href={action.href} className={kitClasses.tile} style={vars}>
              {content}
            </Link>
          );
        }
        return (
          <UnstyledButton
            key={action.key}
            className={`${kitClasses.tile} ${classes.tileButton}`}
            style={vars}
            onClick={action.onClick}
            disabled={action.busy}
            aria-busy={action.busy || undefined}
          >
            {content}
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}
