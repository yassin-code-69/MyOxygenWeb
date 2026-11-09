"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Badge, Box, Collapse, Group, ScrollArea, Skeleton, Stack, Text, Tooltip, VisuallyHidden } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import {
  findActiveNavKey,
  findNavGroupKey,
  type AdminNavBadgeSource,
  type AdminNavChild,
  type AdminNavEntry,
  type AdminNavGroup,
  type AdminNavLink,
} from "../../lib/admin-nav";
import type { AdminAlertCounts } from "../../hooks/admin/use-telemetry";
import { ImageWithFallback } from "../ImageWithFallback";
import { AdminBrand } from "./AdminBrand";
import { formatCount, todayInDhaka } from "./format";
import classes from "./AdminShell.module.css";

// ---------------------------------------------------------------------------
// Open-group state (persisted per user; storage failures are ignored)
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "mo-admin-nav-open:";
const DEFAULT_OPEN_GROUPS: readonly string[] = ["products", "reports"];

function readOpenGroups(userId: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : null;
  } catch {
    return null;
  }
}

function writeOpenGroups(userId: string, keys: readonly string[]): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(keys));
  } catch {
    // Storage can be unavailable (private mode, quota); the state just won't persist.
  }
}

export interface NavOpenState {
  openGroups: readonly string[];
  toggleGroup: (key: string) => void;
  ensureGroupOpen: (key: string) => void;
}

/** Which sidebar groups are expanded, remembered per user in localStorage. */
export function useNavOpenState(userId: string): NavOpenState {
  const [openGroups, setOpenGroups] = useState<readonly string[]>(() => readOpenGroups(userId) ?? DEFAULT_OPEN_GROUPS);

  useEffect(() => {
    writeOpenGroups(userId, openGroups);
  }, [userId, openGroups]);

  const toggleGroup = useCallback((key: string) => {
    setOpenGroups((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }, []);

  const ensureGroupOpen = useCallback((key: string) => {
    setOpenGroups((current) => (current.includes(key) ? current : [...current, key]));
  }, []);

  return { openGroups, toggleGroup, ensureGroupOpen };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function badgeCount(source: AdminNavBadgeSource | undefined, counts: AdminAlertCounts): number {
  if (source === "pendingOrders") {
    return counts.pendingOrders ?? 0;
  }
  if (source === "expiringSoon") {
    return counts.expiringSoon ?? 0;
  }
  return 0;
}

function CountBadge({ count, source }: { count: number; source: AdminNavBadgeSource }) {
  const label = count > 99 ? "99+" : formatCount(count);
  const description = source === "pendingOrders" ? `${formatCount(count)} pending` : `${formatCount(count)} expiring soon`;
  return (
    <>
      <Badge
        size="sm"
        radius="xl"
        variant={source === "pendingOrders" ? "filled" : "light"}
        color={source === "pendingOrders" ? "primaryPink.8" : "primaryPink"}
        className="mo-tabular-nums"
        styles={{ root: { flex: "0 0 auto", paddingInline: 7, minWidth: 22 } }}
        aria-hidden
      >
        {label}
      </Badge>
      <VisuallyHidden>, {description}</VisuallyHidden>
    </>
  );
}

function NewTag() {
  return (
    <Badge size="xs" radius="xl" variant="light" color="accentPurple" tt="none" fw={700} style={{ flex: "0 0 auto" }}>
      New
    </Badge>
  );
}

interface LinkProps {
  link: AdminNavLink;
  active: boolean;
  counts: AdminAlertCounts;
  onNavigate?: () => void;
  nested: boolean;
}

function NavItemLink({ link, active, counts, onNavigate, nested }: LinkProps) {
  const count = badgeCount(link.badge, counts);
  const ItemIcon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className={nested ? classes.subItem : classes.item}
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
    >
      {!nested && ItemIcon ? <ItemIcon size={20} stroke={1.8} className={classes.itemIcon} aria-hidden /> : null}
      <span className={classes.itemLabel}>{link.label}</span>
      {link.tag === "new" ? <NewTag /> : null}
      {link.badge && count > 0 ? <CountBadge count={count} source={link.badge} /> : null}
    </Link>
  );
}

function SoonItem({ child }: { child: AdminNavChild }) {
  return (
    <Tooltip label="Coming soon" position="right" withinPortal>
      <span className={classes.subItem} data-disabled aria-disabled="true" tabIndex={0} role="link">
        <span className={classes.itemLabel}>{child.label}</span>
        <Badge size="xs" radius="xl" variant="light" color="gray" tt="none" fw={600} style={{ flex: "0 0 auto" }}>
          Soon
        </Badge>
      </span>
    </Tooltip>
  );
}

interface GroupProps {
  group: AdminNavGroup;
  open: boolean;
  activeKey: string | null;
  counts: AdminAlertCounts;
  onToggle: (key: string) => void;
  onNavigate?: () => void;
  idPrefix: string;
}

function NavGroup({ group, open, activeKey, counts, onToggle, onNavigate, idPrefix }: GroupProps) {
  const GroupIcon = group.icon;
  const panelId = `${idPrefix}-${group.key}`;
  const containsActive = group.children.some((child) => child.key === activeKey);
  // A collapsed group surfaces its children's counters so nothing is hidden.
  const collapsedCount = open
    ? 0
    : group.children.reduce((sum, child) => sum + (child.kind === "link" ? badgeCount(child.badge, counts) : 0), 0);
  const collapsedSource = group.children.find((child): child is AdminNavLink => child.kind === "link" && Boolean(child.badge))?.badge;

  return (
    <li>
      <button
        type="button"
        className={classes.item}
        aria-expanded={open}
        aria-controls={panelId}
        data-group-active={containsActive || undefined}
        onClick={() => onToggle(group.key)}
      >
        <GroupIcon size={20} stroke={1.8} className={classes.itemIcon} aria-hidden />
        <span className={classes.itemLabel}>{group.label}</span>
        {collapsedSource && collapsedCount > 0 ? <CountBadge count={collapsedCount} source={collapsedSource} /> : null}
        <IconChevronDown size={16} className={classes.chevron} aria-hidden />
      </button>
      <Collapse expanded={open} id={panelId}>
        <ul className={classes.subList}>
          {group.children.map((child) => (
            <li key={child.key}>
              {child.kind === "link" ? (
                <NavItemLink link={child} active={child.key === activeKey} counts={counts} onNavigate={onNavigate} nested />
              ) : (
                <SoonItem child={child} />
              )}
            </li>
          ))}
        </ul>
      </Collapse>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export interface AdminSidebarProps {
  /** Role-filtered tree from `getAdminNavTree(role)`. */
  tree: readonly AdminNavEntry[];
  /** Landing route for the logo. */
  homeHref: string;
  /** App version (from package.json at build time). */
  version: string;
  counts: AdminAlertCounts;
  nav: NavOpenState;
  /** Called after a link is followed (closes the mobile drawer). */
  onNavigate?: () => void;
  /** Hide the logo row (the drawer shows it in its title). */
  showBrand?: boolean;
  /** Distinguishes element ids between the desktop sidebar and the drawer. */
  idPrefix?: string;
}

function SidebarNav({ tree, counts, nav, onNavigate, idPrefix }: Pick<AdminSidebarProps, "tree" | "counts" | "nav" | "onNavigate"> & { idPrefix: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const activeKey = findActiveNavKey(pathname, search);
  const activeGroup = findNavGroupKey(activeKey);
  const { ensureGroupOpen } = nav;

  useEffect(() => {
    if (activeGroup) {
      ensureGroupOpen(activeGroup);
    }
  }, [activeGroup, ensureGroupOpen]);

  return (
    <ul className={classes.navList}>
      {tree.map((entry) =>
        entry.kind === "link" ? (
          <li key={entry.key}>
            <NavItemLink link={entry} active={entry.key === activeKey} counts={counts} onNavigate={onNavigate} nested={false} />
          </li>
        ) : (
          <NavGroup
            key={entry.key}
            group={entry}
            open={nav.openGroups.includes(entry.key)}
            activeKey={activeKey}
            counts={counts}
            onToggle={nav.toggleGroup}
            onNavigate={onNavigate}
            idPrefix={idPrefix}
          />
        ),
      )}
    </ul>
  );
}

function SidebarNavFallback() {
  return (
    <Stack gap={6} aria-hidden>
      {Array.from({ length: 9 }, (_, index) => (
        <Skeleton key={index} height={40} radius="md" />
      ))}
    </Stack>
  );
}

/**
 * Back-office sidebar (mockup): logo, grouped collapsible navigation with
 * live counters, "New" / "Soon" tags, and a version + copyright footer.
 * The nav reads the URL query (to highlight links such as "Add Product")
 * inside its own `<Suspense>` boundary.
 */
export function AdminSidebar({
  tree,
  homeHref,
  version,
  counts,
  nav,
  onNavigate,
  showBrand = true,
  idPrefix = "admin-nav",
}: AdminSidebarProps) {
  const year = todayInDhaka().slice(0, 4);
  return (
    <Stack gap={0} h="100%">
      {showBrand ? (
        <div className={classes.brandRow}>
          <AdminBrand href={homeHref} onNavigate={onNavigate} />
        </div>
      ) : null}
      <ScrollArea type="hover" scrollbarSize={6} style={{ flex: "1 1 auto" }} offsetScrollbars={false}>
        <Box component="nav" aria-label="Back-office" className={classes.nav}>
          <Suspense fallback={<SidebarNavFallback />}>
            <SidebarNav tree={tree} counts={counts} nav={nav} onNavigate={onNavigate} idPrefix={idPrefix} />
          </Suspense>
        </Box>
      </ScrollArea>
      <footer className={classes.footer}>
        <Group gap={10} wrap="nowrap" mb={10}>
          <ImageWithFallback src="/icons/logo-heart.svg" alt="" width={30} height={30} />
          <Box>
            <Text size="sm" fw={700} c="var(--mo-color-text)" lh={1.2}>
              My Oxygen
            </Text>
            <Text size="xs" c="var(--mo-color-text-muted)" lh={1.3} className="mo-tabular-nums">
              v{version}
            </Text>
          </Box>
        </Group>
        <Text size="xs" c="var(--mo-color-text-muted)">
          © {year} My Oxygen. All rights reserved.
        </Text>
      </footer>
    </Stack>
  );
}

