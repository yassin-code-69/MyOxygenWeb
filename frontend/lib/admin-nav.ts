/**
 * Back-office navigation, filtered by the signed-in user's role.
 *
 * `ADMIN_NAV` is the sidebar tree (top-level links and collapsible groups).
 * Every link names the permission its page needs (or `superAdminOnly`);
 * "soon" entries are placeholders rendered disabled. The backend enforces
 * every permission again — this only keeps the UI honest.
 *
 * Flat helpers kept for existing callers:
 *   getAdminNavItems(role)  → links the role may open, in sidebar order
 *   getAdminHomeHref(role)  → landing route (first allowed link)
 *   findAdminNavItem(path)  → the link that owns a pathname
 */
import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconBox,
  IconBrandBlogger,
  IconBuildingStore,
  IconCalendarTime,
  IconCategory,
  IconChartBar,
  IconChartLine,
  IconClipboardData,
  IconClipboardList,
  IconCreditCard,
  IconFileSpreadsheet,
  IconFileText,
  IconFiles,
  IconBellRinging,
  IconDiscount,
  IconList,
  IconPackages,
  IconPhoto,
  IconPlus,
  IconReceipt,
  IconReceiptRefund,
  IconReportMoney,
  IconServerCog,
  IconSettings,
  IconShieldLock,
  IconShoppingBag,
  IconSmartHome,
  IconSpeakerphone,
  IconTags,
  IconTargetArrow,
  IconTrendingUp,
  IconTruckDelivery,
  IconUsers,
  IconUsersGroup,
  IconLayoutBoard,
  IconPhotoScan,
  type Icon,
} from "@tabler/icons-react";
import { PERMISSIONS, type Permission, type UserRole } from "../types/auth";
import { hasPermission } from "./permissions";

/** Live counters a link can show (see `useAdminAlertCounts`). */
export type AdminNavBadgeSource = "pendingOrders" | "expiringSoon";

interface AdminNavAccess {
  /** Permission the page needs. */
  permission?: Permission;
  /** Only `SUPER_ADMIN` may open it (profit, expenses). */
  superAdminOnly?: boolean;
}

export interface AdminNavLink extends AdminNavAccess {
  kind: "link";
  key: string;
  label: string;
  href: string;
  /** Required on top-level links; optional inside groups (the sidebar shows none there). */
  icon?: Icon;
  /** Short helper text (command palette, screen readers). */
  description: string;
  /** Match the pathname exactly (dashboard). */
  exact?: boolean;
  badge?: AdminNavBadgeSource;
  /** Highlight a freshly shipped page. */
  tag?: "new";
}

export interface AdminNavSoon extends AdminNavAccess {
  kind: "soon";
  key: string;
  label: string;
  icon?: Icon;
  description: string;
}

export type AdminNavChild = AdminNavLink | AdminNavSoon;

export interface AdminNavGroup {
  kind: "group";
  key: string;
  label: string;
  icon: Icon;
  children: readonly AdminNavChild[];
}

export type AdminNavEntry = AdminNavLink | AdminNavGroup;

/** The full sidebar tree, in order. */
export const ADMIN_NAV: readonly AdminNavEntry[] = [
  {
    kind: "link",
    key: "dashboard",
    label: "Dashboard",
    href: "/admin",
    icon: IconSmartHome,
    permission: PERMISSIONS.ANALYTICS_READ,
    description: "Sales, orders and stock at a glance",
    exact: true,
  },
  {
    kind: "link",
    key: "orders",
    label: "Orders",
    href: "/admin/orders",
    icon: IconClipboardList,
    permission: PERMISSIONS.ORDERS_READ,
    description: "Fulfil, dispatch and track orders",
    badge: "pendingOrders",
  },
  {
    kind: "link",
    key: "customers",
    label: "Customers",
    href: "/admin/customers",
    icon: IconUsers,
    permission: PERMISSIONS.ORDERS_READ,
    description: "Customer accounts and order history",
  },
  {
    kind: "group",
    key: "products",
    label: "Products",
    icon: IconShoppingBag,
    children: [
      {
        kind: "link",
        key: "products-all",
        label: "All Products",
        href: "/admin/products",
        icon: IconList,
        permission: PERMISSIONS.PRODUCTS_READ,
        description: "Catalog, prices and listing status",
      },
      {
        kind: "link",
        key: "products-new",
        label: "Add Product",
        href: "/admin/products?new=1",
        icon: IconPlus,
        permission: PERMISSIONS.PRODUCTS_WRITE,
        description: "Create a new catalog product",
      },
      {
        kind: "link",
        key: "categories",
        label: "Categories",
        href: "/admin/categories",
        icon: IconCategory,
        permission: PERMISSIONS.PRODUCTS_READ,
        description: "Storefront categories",
      },
      {
        kind: "link",
        key: "brands",
        label: "Brands",
        href: "/admin/brands",
        icon: IconTags,
        permission: PERMISSIONS.PRODUCTS_READ,
        description: "Brands across the catalog",
      },
    ],
  },
  {
    kind: "group",
    key: "inventory",
    label: "Inventory",
    icon: IconBox,
    children: [
      {
        kind: "link",
        key: "batches",
        label: "Batch Inspector",
        href: "/admin/batches",
        icon: IconCalendarTime,
        permission: PERMISSIONS.BATCHES_MANAGE,
        description: "Batches, expiry health and stock imports",
      },
      {
        kind: "link",
        key: "expiry",
        label: "Expiry / FEFO",
        href: "/admin/expiry",
        icon: IconAlertTriangle,
        permission: PERMISSIONS.BATCHES_MANAGE,
        description: "Batches expiring soon, first-expiry-first-out",
        badge: "expiringSoon",
      },
      {
        kind: "link",
        key: "ledger",
        label: "Stock Ledger",
        href: "/admin/ledger",
        icon: IconFileSpreadsheet,
        permission: PERMISSIONS.STOCK_ADJUST,
        description: "Every stock movement, audited",
      },
    ],
  },
  {
    kind: "link",
    key: "delivery",
    label: "Delivery & Tracking",
    href: "/admin/delivery",
    icon: IconTruckDelivery,
    permission: PERMISSIONS.ORDERS_READ,
    description: "Courier hand-offs and parcels in transit",
  },
  {
    kind: "group",
    key: "marketing",
    label: "Marketing",
    icon: IconSpeakerphone,
    children: [
      {
        kind: "link",
        key: "discounts",
        label: "Coupons & Offers",
        href: "/admin/discounts",
        icon: IconDiscount,
        permission: PERMISSIONS.DISCOUNTS_MANAGE,
        description: "Coupons, automatic discounts and flash sales",
      },
      { kind: "soon", key: "campaigns", label: "Campaigns", icon: IconTargetArrow, permission: PERMISSIONS.DISCOUNTS_MANAGE, description: "Marketing campaigns" },
      { kind: "soon", key: "banners", label: "Banners", icon: IconPhoto, permission: PERMISSIONS.DISCOUNTS_MANAGE, description: "Storefront banners" },
      { kind: "soon", key: "push", label: "Push Notifications", icon: IconBellRinging, permission: PERMISSIONS.DISCOUNTS_MANAGE, description: "Push messages to customers" },
    ],
  },
  {
    kind: "group",
    key: "payments",
    label: "Payments",
    icon: IconCreditCard,
    children: [
      {
        kind: "link",
        key: "transactions",
        label: "Transactions",
        href: "/admin/payments",
        icon: IconArrowsExchange,
        permission: PERMISSIONS.ORDERS_READ,
        description: "Collected, pending COD and failed payments",
      },
      {
        kind: "link",
        key: "refunds",
        label: "Refunds",
        href: "/admin/payments/refunds",
        icon: IconReceiptRefund,
        permission: PERMISSIONS.ORDERS_READ,
        description: "Refunded orders",
      },
      {
        kind: "link",
        key: "invoices",
        label: "Invoices",
        href: "/admin/invoices",
        icon: IconReceipt,
        permission: PERMISSIONS.ORDERS_READ,
        description: "Billing records and PDF invoices",
      },
      {
        kind: "link",
        key: "expenses",
        label: "Expenses",
        href: "/admin/expenses",
        icon: IconReportMoney,
        superAdminOnly: true,
        description: "Operating expenses (owner only)",
      },
    ],
  },
  {
    kind: "group",
    key: "reports",
    label: "Reports",
    icon: IconChartBar,
    children: [
      {
        kind: "link",
        key: "report-sales",
        label: "Sales Report",
        href: "/admin/reports/sales",
        icon: IconChartLine,
        permission: PERMISSIONS.ANALYTICS_READ,
        description: "Revenue and orders over any period",
      },
      {
        kind: "link",
        key: "report-products",
        label: "Product Report",
        href: "/admin/reports/products",
        icon: IconPackages,
        permission: PERMISSIONS.ANALYTICS_READ,
        description: "Units sold and revenue per product",
      },
      {
        kind: "link",
        key: "report-customers",
        label: "Customer Report",
        href: "/admin/reports/customers",
        icon: IconUsersGroup,
        permission: PERMISSIONS.ANALYTICS_READ,
        description: "New, returning and top customers",
      },
      {
        kind: "link",
        key: "report-inventory",
        label: "Inventory Report",
        href: "/admin/reports/inventory",
        icon: IconClipboardData,
        permission: PERMISSIONS.ANALYTICS_READ,
        description: "Stock value, low stock and dead stock",
      },
      {
        kind: "link",
        key: "report-profit",
        label: "Profit & Margin",
        href: "/admin/reports/profit",
        icon: IconTrendingUp,
        superAdminOnly: true,
        description: "Revenue, cost, profit and margins (owner only)",
        tag: "new",
      },
    ],
  },
  {
    kind: "group",
    key: "content",
    label: "Content",
    icon: IconFileText,
    children: [
      { kind: "soon", key: "pages", label: "Pages", icon: IconFiles, permission: PERMISSIONS.DISCOUNTS_MANAGE, description: "Static storefront pages" },
      { kind: "soon", key: "blog", label: "Blog / News", icon: IconBrandBlogger, permission: PERMISSIONS.DISCOUNTS_MANAGE, description: "Articles and announcements" },
      { kind: "soon", key: "media", label: "Media", icon: IconPhotoScan, permission: PERMISSIONS.DISCOUNTS_MANAGE, description: "Image library" },
    ],
  },
  {
    kind: "group",
    key: "settings",
    label: "Settings",
    icon: IconSettings,
    children: [
      { kind: "soon", key: "store-settings", label: "Store Settings", icon: IconBuildingStore, permission: PERMISSIONS.STAFF_MANAGE, description: "Store profile and checkout options" },
      {
        kind: "link",
        key: "roles",
        label: "Admin Roles",
        href: "/admin/settings/roles",
        icon: IconShieldLock,
        permission: PERMISSIONS.STAFF_MANAGE,
        description: "Staff accounts and role permissions",
      },
      {
        kind: "link",
        key: "system",
        label: "System Settings",
        href: "/admin/settings/system",
        icon: IconServerCog,
        permission: PERMISSIONS.STAFF_MANAGE,
        description: "API, database, jobs and integrations status",
      },
    ],
  },
];

/** Icon for the command palette's "Go to" actions when a link has none. */
export const ADMIN_NAV_FALLBACK_ICON: Icon = IconLayoutBoard;

/** Whether the role may open (or see the placeholder of) an entry. */
export function canAccessNavEntry(role: UserRole | null | undefined, entry: AdminNavAccess): boolean {
  if (!role) {
    return false;
  }
  if (entry.superAdminOnly) {
    return role === "SUPER_ADMIN";
  }
  return entry.permission ? hasPermission(role, entry.permission) : true;
}

/**
 * The sidebar tree for a role: links the role may open, "soon" placeholders
 * for areas the role would manage, and groups with at least one visible child.
 */
export function getAdminNavTree(role: UserRole | null | undefined): AdminNavEntry[] {
  const result: AdminNavEntry[] = [];
  for (const entry of ADMIN_NAV) {
    if (entry.kind === "link") {
      if (canAccessNavEntry(role, entry)) {
        result.push(entry);
      }
      continue;
    }
    const children = entry.children.filter((child) => canAccessNavEntry(role, child));
    if (children.length > 0) {
      result.push({ ...entry, children });
    }
  }
  return result;
}

/** Flat, role-filtered link used by the command palette, guards and the header. */
export interface AdminNavItem {
  key: string;
  label: string;
  href: string;
  icon: Icon;
  /** `null` for SUPER_ADMIN-only pages. */
  permission: Permission | null;
  superAdminOnly: boolean;
  description: string;
  exact?: boolean;
  /** Parent group label (`"Reports"`), `null` for top-level links. */
  groupLabel: string | null;
}

function toNavItem(link: AdminNavLink, group: AdminNavGroup | null): AdminNavItem {
  return {
    key: link.key,
    label: link.label,
    href: link.href,
    icon: link.icon ?? group?.icon ?? ADMIN_NAV_FALLBACK_ICON,
    permission: link.permission ?? null,
    superAdminOnly: Boolean(link.superAdminOnly),
    description: link.description,
    exact: link.exact,
    groupLabel: group?.label ?? null,
  };
}

/** Every link in sidebar order (role-agnostic). */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = ADMIN_NAV.flatMap((entry) =>
  entry.kind === "link"
    ? [toNavItem(entry, null)]
    : entry.children.flatMap((child) => (child.kind === "link" ? [toNavItem(child, entry)] : [])),
);

/** Links the role may open, in sidebar order. */
export function getAdminNavItems(role: UserRole | null | undefined): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) =>
    canAccessNavEntry(role, { permission: item.permission ?? undefined, superAdminOnly: item.superAdminOnly }),
  );
}

/** Landing route for the role (first allowed link), or `null` when nothing is allowed. */
export function getAdminHomeHref(role: UserRole | null | undefined): string | null {
  return getAdminNavItems(role)[0]?.href ?? null;
}

function splitHref(href: string): { path: string; query: URLSearchParams } {
  const [path = href, query = ""] = href.split("?");
  return { path, query: new URLSearchParams(query) };
}

/**
 * How well a link matches the current location (0 = no match). The longest
 * matching path wins, so `/admin/payments/refunds` beats `/admin/payments`;
 * links with a query (`/admin/products?new=1`) match only when every one of
 * their parameters is present.
 */
function matchScore(href: string, exact: boolean | undefined, pathname: string, search: URLSearchParams | null): number {
  const { path, query } = splitHref(href);
  const pathMatches = exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  if (!pathMatches) {
    return 0;
  }
  let queryBonus = 0;
  for (const [key, value] of query.entries()) {
    if (!search || search.get(key) !== value) {
      return 0;
    }
    queryBonus += 1;
  }
  return path.length * 10 + queryBonus;
}

/**
 * Whether the location belongs to the item. Without `search`, links that carry
 * a query string never match.
 */
export function isAdminNavItemActive(
  item: Pick<AdminNavItem, "href" | "exact">,
  pathname: string,
  search: URLSearchParams | null = null,
): boolean {
  return matchScore(item.href, item.exact, pathname, search) > 0;
}

/** Key of the link that best matches the location, or `null`. */
export function findActiveNavKey(pathname: string, search: URLSearchParams | null = null): string | null {
  let best: { key: string; score: number } | null = null;
  for (const item of ADMIN_NAV_ITEMS) {
    const score = matchScore(item.href, item.exact, pathname, search);
    if (score > 0 && (!best || score > best.score)) {
      best = { key: item.key, score };
    }
  }
  return best?.key ?? null;
}

/** The link that owns `pathname` (for page titles / breadcrumbs). */
export function findAdminNavItem(pathname: string, search: URLSearchParams | null = null): AdminNavItem | undefined {
  const key = findActiveNavKey(pathname, search);
  return key ? ADMIN_NAV_ITEMS.find((item) => item.key === key) : undefined;
}

/** Key of the group that contains a link key, or `null` for top-level links. */
export function findNavGroupKey(linkKey: string | null): string | null {
  if (!linkKey) {
    return null;
  }
  for (const entry of ADMIN_NAV) {
    if (entry.kind === "group" && entry.children.some((child) => child.key === linkKey)) {
      return entry.key;
    }
  }
  return null;
}
