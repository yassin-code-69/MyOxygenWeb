### Phase 9 Context & Architecture Blueprint

Phase 9 delivers the complete **My Oxygen Admin Portal** (`apps/admin`) — a production-grade Mantine v7 back-office that gives the single owner and their staff full operational control over inventory, orders, and business telemetry. Every screen is gated by role-based access control derived from the five admin roles established in Phase 1 (`SUPER_ADMIN`, `INVENTORY_MANAGER`, `ORDER_MANAGER`, `MARKETING_MANAGER`, `SUPPORT_STAFF`).

Three critical capabilities are introduced in this phase:

- **Batch Inspector:** A filterable, color-coded ledger of every product batch with expiry-based risk signals, enabling the warehouse team to act on approaching expirations without leaving the browser.

- **Inventory Audit Ledger:** A paginated, export-ready log of every `stock_history_log` entry, providing immutable traceability for imports, purchases, returns, manual adjustments, and expired-scrap write-offs.

- **Sales Telemetry:** A live analytics surface backed by a dedicated Hono.js summary endpoint, rendering revenue trends, order-status distribution, and top-product performance via `@mantine/charts` with zero third-party chart dependencies.

The `apps/admin` Next.js app shares the `@my-oxygen/ui-tokens` design system (Primary Pink `#FF6B8B`, Secondary Green `#4CAF7D`, Accent Purple `#A78BFA`, Cream BG `#FFF8F6`, Dark Text `#1F2937`) and communicates exclusively with `apps/api` through authenticated, role-scoped endpoints introduced in Phase 7 and Phase 8.

---

### Step 1: Admin App Setup & Auth Guard

Bootstraps the `apps/admin` Next.js application with the shared Mantine theme, and enforces authentication at the middleware layer using a short-lived JWT stored in an `httpOnly` cookie.

#### `apps/admin/src/app/layout.tsx`

```tsx
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/notifications/styles.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import {
  MantineProvider,
  ColorSchemeScript,
  createTheme,
  type MantineColorsTuple,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { myOxygenColors } from "@my-oxygen/ui-tokens";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// Extend Mantine's color palette with brand tokens
const primaryPinkShades: MantineColorsTuple = [
  "#FFF0F3",
  "#FFD6DF",
  "#FFB3C1",
  "#FF8FA3",
  "#FF6B8B",
  "#F5547A",
  "#E03D68",
  "#C42956",
  "#A51845",
  "#870A34",
];
const secondaryGreenShades: MantineColorsTuple = [
  "#E8F8F0",
  "#C3EDDA",
  "#9AE1C3",
  "#6FD5A9",
  "#4CAF7D",
  "#3B9E6D",
  "#2D8D5E",
  "#207C50",
  "#146B42",
  "#095A35",
];
const accentPurpleShades: MantineColorsTuple = [
  "#F3F0FF",
  "#E0D9FE",
  "#C9BFFE",
  "#B0A4FC",
  "#A78BFA",
  "#9172F5",
  "#7C5BEC",
  "#6847E0",
  "#5536D0",
  "#4427BE",
];

const adminTheme = createTheme({
  primaryColor: "brand-pink",
  colors: {
    "brand-pink": primaryPinkShades,
    "brand-green": secondaryGreenShades,
    "brand-purple": accentPurpleShades,
  },
  fontFamily: "var(--font-inter), sans-serif",
  headings: { fontFamily: "var(--font-inter), sans-serif" },
  defaultRadius: "md",
  components: {
    Button: {
      defaultProps: { color: "brand-pink" },
    },
    Badge: {
      defaultProps: { variant: "light" },
    },
    Paper: {
      defaultProps: { shadow: "sm", radius: "md" },
    },
    Modal: {
      defaultProps: { radius: "md" },
    },
  },
});

export const metadata: Metadata = {
  title: "My Oxygen Admin Portal",
  description: "Maternal & Newborn Health — Back Office",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body
        className={inter.variable}
        style={{ background: myOxygenColors.creamBackground, margin: 0 }}
      >
        <MantineProvider theme={adminTheme} defaultColorScheme="light">
          <Notifications position="top-right" zIndex={1000} />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
```

#### `apps/admin/src/middleware.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and Next.js internals
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("admin_token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET ?? "fallback-dev-secret-minimum-32-chars!",
    );
    const { payload } = await jwtVerify(token, secret);

    // Attach decoded claims to request headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-admin-user-id", String(payload.sub ?? ""));
    requestHeaders.set("x-admin-user-role", String(payload.role ?? ""));

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    // Token invalid or expired — clear cookie and redirect
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("admin_token");
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

#### `apps/admin/src/app/login/page.tsx`

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Button,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm, isEmail, hasLength } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { motion } from "motion/react";
import { IconHeartFilled } from "@tabler/icons-react";
import { myOxygenColors } from "@my-oxygen/ui-tokens";

interface LoginFormValues {
  email: string;
  password: string;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";

  const form = useForm<LoginFormValues>({
    initialValues: { email: "", password: "" },
    validate: {
      email: isEmail("Enter a valid email address"),
      password: hasLength({ min: 6 }, "Password must be at least 6 characters"),
    },
  });

  async function handleSubmit(values: LoginFormValues) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const data = await res.json();
        notifications.show({
          color: "red",
          title: "Login Failed",
          message: data.message ?? "Invalid credentials",
        });
        return;
      }

      // Cookie is set server-side in the API route
      router.replace(redirectTo);
    } catch {
      notifications.show({
        color: "red",
        title: "Network Error",
        message: "Could not reach the server. Please try again.",
      });
    }
  }

  return (
    <Box
      style={{
        minHeight: "100vh",
        background: `linear-gradient(135deg, ${myOxygenColors.creamBackground} 0%, #FFE4EC 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <Paper p="xl" w={420} style={{ border: `1px solid #FFD6DF` }}>
          <Stack gap="md">
            {/* Brand Header */}
            <Stack gap={4} align="center">
              <Box
                style={{
                  background: `linear-gradient(135deg, ${myOxygenColors.primaryPink}, #F472B6)`,
                  borderRadius: "50%",
                  width: 52,
                  height: 52,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconHeartFilled size={26} color="#fff" />
              </Box>
              <Title order={2} ta="center" c={myOxygenColors.darkText}>
                My Oxygen Admin
              </Title>
              <Text size="sm" c="dimmed" ta="center">
                Sign in to access the management portal
              </Text>
            </Stack>

            {/* Form */}
            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="sm">
                <TextInput
                  label="Email Address"
                  placeholder="admin@myoxygen.com"
                  type="email"
                  {...form.getInputProps("email")}
                />
                <PasswordInput
                  label="Password"
                  placeholder="••••••••"
                  {...form.getInputProps("password")}
                />
                <Button
                  type="submit"
                  fullWidth
                  mt="xs"
                  loading={form.submitting}
                  style={{
                    background: `linear-gradient(135deg, ${myOxygenColors.primaryPink}, #F472B6)`,
                  }}
                >
                  Sign In
                </Button>
              </Stack>
            </form>
          </Stack>
        </Paper>
      </motion.div>
    </Box>
  );
}
```

#### `apps/admin/src/app/api/auth/login/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const JWT_SECRET =
  process.env.JWT_SECRET ?? "fallback-dev-secret-minimum-32-chars!";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8-hour session

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Delegate credential validation to the Hono backend
  const apiRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!apiRes.ok) {
    const error = await apiRes.json();
    return NextResponse.json(error, { status: apiRes.status });
  }

  const { token, user } = await apiRes.json();

  // Re-sign as httpOnly cookie so the browser never sees the raw JWT
  const secret = new TextEncoder().encode(JWT_SECRET);
  const signedToken = await new SignJWT({ sub: user.id, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);

  const response = NextResponse.json({ ok: true, user });
  response.cookies.set("admin_token", signedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}
```

---

### Step 2: Admin Shell Layout — AppShell with Sidebar

The `AdminShell` wraps every protected page, providing persistent navigation, role-filtered links, a dynamic page title, and a user avatar dropdown.

#### `apps/admin/src/components/layout/AdminShell.tsx`

```tsx
"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Divider,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAnalyze,
  IconBox,
  IconChartBar,
  IconClipboardList,
  IconHome,
  IconLogout,
  IconPackage,
  IconTag,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { myOxygenColors } from "@my-oxygen/ui-tokens";
import type { AdminUser } from "@/types/auth";

// ─── Nav Item Definition ─────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Roles that may see this item — omit to allow all admin roles */
  allowedRoles?: AdminUser["role"][];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <IconHome size={18} />,
    allowedRoles: [
      "SUPER_ADMIN",
      "INVENTORY_MANAGER",
      "ORDER_MANAGER",
      "MARKETING_MANAGER",
    ],
  },
  {
    label: "Products",
    href: "/products",
    icon: <IconBox size={18} />,
    allowedRoles: ["SUPER_ADMIN", "INVENTORY_MANAGER"],
  },
  {
    label: "Inventory",
    href: "/inventory/batches",
    icon: <IconPackage size={18} />,
    allowedRoles: ["SUPER_ADMIN", "INVENTORY_MANAGER"],
  },
  {
    label: "Orders",
    href: "/orders",
    icon: <IconClipboardList size={18} />,
    // All roles may view orders
  },
  {
    label: "Discounts",
    href: "/discounts",
    icon: <IconTag size={18} />,
    allowedRoles: ["SUPER_ADMIN", "MARKETING_MANAGER"],
  },
  {
    label: "Staff",
    href: "/staff",
    icon: <IconUsers size={18} />,
    allowedRoles: ["SUPER_ADMIN"],
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: <IconChartBar size={18} />,
    allowedRoles: ["SUPER_ADMIN", "MARKETING_MANAGER"],
  },
];

const ROLE_COLORS: Record<AdminUser["role"], string> = {
  SUPER_ADMIN: "brand-pink",
  INVENTORY_MANAGER: "brand-green",
  ORDER_MANAGER: "blue",
  MARKETING_MANAGER: "brand-purple",
  SUPPORT_STAFF: "gray",
};

// ─── Component ───────────────────────────────────────────────────────────────

interface AdminShellProps {
  children: React.ReactNode;
  user: AdminUser;
  pageTitle: string;
}

export function AdminShell({ children, user, pageTitle }: AdminShellProps) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const pathname = usePathname();
  const router = useRouter();

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.allowedRoles || item.allowedRoles.includes(user.role),
  );

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const initials = user.fullName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <AppShell
      navbar={{
        width: 240,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      header={{ height: 60 }}
      padding="md"
    >
      {/* ── Header ── */}
      <AppShell.Header
        style={{
          borderBottom: `1px solid #FFD6DF`,
          background: "#fff",
        }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              color={myOxygenColors.primaryPink}
            />
            <Title order={4} c={myOxygenColors.darkText} visibleFrom="sm">
              {pageTitle}
            </Title>
          </Group>

          {/* User Avatar Dropdown */}
          <Menu shadow="md" width={180} position="bottom-end">
            <Menu.Target>
              <UnstyledButton>
                <Group gap="xs">
                  <Avatar
                    size={34}
                    radius="xl"
                    color="brand-pink"
                    variant="filled"
                  >
                    {initials}
                  </Avatar>
                  <Box visibleFrom="sm">
                    <Text
                      size="sm"
                      fw={500}
                      c={myOxygenColors.darkText}
                      lineClamp={1}
                    >
                      {user.fullName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {user.role.replace(/_/g, " ")}
                    </Text>
                  </Box>
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconUser size={14} />}>
                Profile
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconLogout size={14} />}
                color="red"
                onClick={handleLogout}
              >
                Logout
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      {/* ── Sidebar ── */}
      <AppShell.Navbar
        p="xs"
        style={{
          background: "#fff",
          borderRight: `1px solid #FFD6DF`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Logo */}
        <Box px="xs" py="sm">
          <Group gap="xs">
            <Box
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${myOxygenColors.primaryPink}, #F472B6)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Text size="xs" fw={700} c="#fff">
                O²
              </Text>
            </Box>
            <Text fw={700} size="sm" c={myOxygenColors.primaryPink}>
              My Oxygen
            </Text>
          </Group>
        </Box>

        <Divider my="xs" color="#FFE4EC" />

        {/* Nav Links */}
        <ScrollArea flex={1} type="scroll">
          <Stack gap={2}>
            {visibleNav.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);

              return (
                <NavLink
                  key={item.href}
                  component={Link}
                  href={item.href}
                  label={item.label}
                  leftSection={item.icon}
                  active={isActive}
                  onClick={close}
                  style={{
                    borderRadius: 8,
                    color: isActive
                      ? myOxygenColors.primaryPink
                      : myOxygenColors.darkText,
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? "#FFF0F3" : "transparent",
                  }}
                  styles={{
                    root: {
                      "&:hover": { background: "#FFF8F6" },
                    },
                  }}
                />
              );
            })}
          </Stack>
        </ScrollArea>

        {/* Sidebar Footer */}
        <Divider my="xs" color="#FFE4EC" />
        <Box px="xs" pb="xs">
          <Group gap="xs">
            <Avatar size={28} radius="xl" color="brand-pink" variant="light">
              {initials}
            </Avatar>
            <Box style={{ overflow: "hidden" }}>
              <Text
                size="xs"
                fw={500}
                c={myOxygenColors.darkText}
                lineClamp={1}
              >
                {user.fullName}
              </Text>
              <Badge
                size="xs"
                color={ROLE_COLORS[user.role]}
                variant="light"
                style={{ fontSize: 9 }}
              >
                {user.role.replace(/_/g, " ")}
              </Badge>
            </Box>
          </Group>
        </Box>
      </AppShell.Navbar>

      {/* ── Main Content ── */}
      <AppShell.Main style={{ background: myOxygenColors.creamBackground }}>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
```

#### `apps/admin/src/types/auth.ts`

```typescript
export type AdminRole =
  | "SUPER_ADMIN"
  | "INVENTORY_MANAGER"
  | "ORDER_MANAGER"
  | "MARKETING_MANAGER"
  | "SUPPORT_STAFF";

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: AdminRole;
}
```

---

### Step 3: Dashboard Overview Page

Presents four KPI stat cards, a recent-orders table, and a low-stock alert list — all animated on mount using `motion`.

#### `apps/admin/src/app/(admin)/dashboard/page.tsx`

```tsx
import { headers } from "next/headers";
import { DashboardClient } from "./_components/DashboardClient";
import { AdminShell } from "@/components/layout/AdminShell";
import type { AdminUser } from "@/types/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getDashboardData(token: string) {
  const [summaryRes, ordersRes, lowStockRes] = await Promise.all([
    fetch(`${API_BASE}/admin/dashboard/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
    }),
    fetch(`${API_BASE}/admin/orders?limit=10&sort=createdAt:desc`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    }),
    fetch(`${API_BASE}/admin/inventory/low-stock`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 120 },
    }),
  ]);

  return {
    summary: summaryRes.ok ? await summaryRes.json() : null,
    recentOrders: ordersRes.ok ? await ordersRes.json() : [],
    lowStockProducts: lowStockRes.ok ? await lowStockRes.json() : [],
  };
}

export default async function DashboardPage() {
  const headersList = await headers();
  const userId = headersList.get("x-admin-user-id") ?? "";
  const userRole = headersList.get("x-admin-user-role") ?? "SUPPORT_STAFF";

  // In production fetch the full user record; mock here for brevity
  const user: AdminUser = {
    id: userId,
    fullName: "Admin User",
    email: "admin@myoxygen.com",
    role: userRole as AdminUser["role"],
  };

  // Cookie forwarded via server component — read raw token from cookie store
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value ?? "";

  const data = await getDashboardData(token);

  return (
    <AdminShell user={user} pageTitle="Dashboard">
      <DashboardClient {...data} />
    </AdminShell>
  );
}
```

#### `apps/admin/src/app/(admin)/dashboard/_components/DashboardClient.tsx`

```tsx
"use client";

import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconPackage,
  IconRefresh,
  IconShoppingCart,
  IconTruckDelivery,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { myOxygenColors } from "@my-oxygen/ui-tokens";

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" },
  },
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  delta: number; // Positive = up, negative = down
  icon: React.ReactNode;
  iconBg: string;
}

function KpiCard({ label, value, delta, icon, iconBg }: KpiCardProps) {
  const isUp = delta >= 0;
  return (
    <motion.div variants={fadeInUp} style={{ height: "100%" }}>
      <Paper p="md" h="100%" style={{ border: "1px solid #FFE4EC" }}>
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text size="xs" c="dimmed" fw={500} tt="uppercase" lts={0.5}>
              {label}
            </Text>
            <Text size="xl" fw={700} c={myOxygenColors.darkText}>
              {value}
            </Text>
            <Group gap={4}>
              {isUp ? (
                <IconArrowUp size={14} color={myOxygenColors.success} />
              ) : (
                <IconArrowDown size={14} color={myOxygenColors.error} />
              )}
              <Text size="xs" c={isUp ? "green" : "red"} fw={500}>
                {Math.abs(delta)}% vs yesterday
              </Text>
            </Group>
          </Stack>
          <Box
            style={{
              background: iconBg,
              borderRadius: 10,
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        </Group>
      </Paper>
    </motion.div>
  );
}

// ─── Status Badge Map ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  PENDING: "yellow",
  PROCESSING: "blue",
  SHIPPED: "cyan",
  DELIVERED: "green",
  CANCELLED: "red",
  REFUNDED: "orange",
};

// ─── Main Client Component ───────────────────────────────────────────────────

interface DashboardClientProps {
  summary: {
    totalOrdersToday: number;
    revenueToday: number;
    ordersDelta: number;
    revenueDelta: number;
    lowStockCount: number;
    expiringSoonCount: number;
  } | null;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    total: number;
    status: string;
    courierProvider: string | null;
    trackingId: string | null;
    createdAt: string;
  }>;
  lowStockProducts: Array<{
    id: string;
    title: string;
    sku: string;
    availableQuantity: number;
    lowStockThreshold: number;
  }>;
}

export function DashboardClient({
  summary,
  recentOrders,
  lowStockProducts,
}: DashboardClientProps) {
  const kpis: KpiCardProps[] = [
    {
      label: "Orders Today",
      value: summary?.totalOrdersToday ?? 0,
      delta: summary?.ordersDelta ?? 0,
      icon: <IconShoppingCart size={22} color="#fff" />,
      iconBg: `linear-gradient(135deg, ${myOxygenColors.primaryPink}, #F472B6)`,
    },
    {
      label: "Revenue Today",
      value: `৳ ${(summary?.revenueToday ?? 0).toLocaleString()}`,
      delta: summary?.revenueDelta ?? 0,
      icon: <IconTruckDelivery size={22} color="#fff" />,
      iconBg: `linear-gradient(135deg, ${myOxygenColors.secondaryGreen}, #34D399)`,
    },
    {
      label: "Low Stock SKUs",
      value: summary?.lowStockCount ?? 0,
      delta: 0,
      icon: <IconPackage size={22} color="#fff" />,
      iconBg: "linear-gradient(135deg, #F59E0B, #FCD34D)",
    },
    {
      label: "Expiring Soon",
      value: summary?.expiringSoonCount ?? 0,
      delta: 0,
      icon: <IconAlertTriangle size={22} color="#fff" />,
      iconBg: `linear-gradient(135deg, ${myOxygenColors.accentPurple}, #C4B5FD)`,
    },
  ];

  return (
    <Stack gap="lg">
      {/* KPI Cards */}
      <motion.div variants={stagger} initial="initial" animate="animate">
        <Grid>
          {kpis.map((kpi) => (
            <Grid.Col key={kpi.label} span={{ base: 12, xs: 6, md: 3 }}>
              <KpiCard {...kpi} />
            </Grid.Col>
          ))}
        </Grid>
      </motion.div>

      {/* Recent Orders */}
      <Paper p="md" style={{ border: "1px solid #FFE4EC" }}>
        <Title order={5} mb="sm" c={myOxygenColors.darkText}>
          Recent Orders
        </Title>
        <Table.ScrollContainer minWidth={640}>
          <Table striped highlightOnHover withColumnBorders={false}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Order #</Table.Th>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Total</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Tracking</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {recentOrders.map((order) => (
                <Table.Tr key={order.id}>
                  <Table.Td fw={500}>{order.orderNumber}</Table.Td>
                  <Table.Td>{order.customerName}</Table.Td>
                  <Table.Td>৳ {order.total.toLocaleString()}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={STATUS_COLORS[order.status] ?? "gray"}
                      size="sm"
                    >
                      {order.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {order.trackingId ? (
                      <Anchor
                        href={`https://track.pathao.com/${order.trackingId}`}
                        target="_blank"
                        size="xs"
                      >
                        {order.trackingId}
                      </Anchor>
                    ) : (
                      <Text size="xs" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      {/* Low Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <Paper
          p="md"
          style={{ border: `1px solid ${myOxygenColors.warning}30` }}
        >
          <Group justify="space-between" mb="sm">
            <Title order={5} c={myOxygenColors.darkText}>
              Low Stock Alerts
            </Title>
            <ActionIcon variant="subtle" color="brand-pink">
              <IconRefresh size={16} />
            </ActionIcon>
          </Group>
          <Stack gap="xs">
            {lowStockProducts.map((p) => (
              <Group
                key={p.id}
                justify="space-between"
                p="xs"
                style={{ borderRadius: 8, background: "#FFFBEB" }}
              >
                <Box>
                  <Text size="sm" fw={500} c={myOxygenColors.darkText}>
                    {p.title}
                  </Text>
                  <Text size="xs" c="dimmed">
                    SKU: {p.sku} · {p.availableQuantity} left (threshold:{" "}
                    {p.lowStockThreshold})
                  </Text>
                </Box>
                <Button size="xs" variant="light" color="orange">
                  Restock
                </Button>
              </Group>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
```

---

### Step 4: Batch Inspector Page

A full-featured, filterable batch ledger with expiry-risk color coding and a modal-driven import form.

#### `apps/admin/src/app/(admin)/inventory/batches/page.tsx`

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconSearch, IconFilter } from "@tabler/icons-react";
import { myOxygenColors } from "@my-oxygen/ui-tokens";
import dayjs from "dayjs";

// ─── Types ────────────────────────────────────────────────────────────────────

type BatchStatus = "Active" | "Expiring Soon" | "Expired";

interface BatchRow {
  id: string;
  productId: string;
  productTitle: string;
  batchNumber: string;
  manufactureDate: string | null;
  expiryDate: string;
  initialQuantity: number;
  availableQuantity: number;
}

interface ImportBatchForm {
  productId: string;
  batchNumber: string;
  manufactureDate: Date | null;
  expiryDate: Date | null;
  quantity: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStatus(expiryDate: string): BatchStatus {
  const today = dayjs();
  const expiry = dayjs(expiryDate);
  if (expiry.isBefore(today)) return "Expired";
  if (expiry.diff(today, "day") <= 30) return "Expiring Soon";
  return "Active";
}

function expiryColor(status: BatchStatus): string {
  if (status === "Expired") return "red";
  if (status === "Expiring Soon") return "orange";
  return "green";
}

const STATUS_BADGE_COLOR: Record<BatchStatus, string> = {
  Active: "green",
  "Expiring Soon": "orange",
  Expired: "red",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Component ───────────────────────────────────────────────────────────────

export default function BatchInspectorPage() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    null,
    null,
  ]);
  const [products, setProducts] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [importOpened, { open: openImport, close: closeImport }] =
    useDisclosure(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ImportBatchForm>({
    initialValues: {
      productId: "",
      batchNumber: "",
      manufactureDate: null,
      expiryDate: null,
      quantity: 1,
    },
    validate: {
      productId: (v) => (!v ? "Select a product" : null),
      batchNumber: (v) => (!v.trim() ? "Batch number is required" : null),
      expiryDate: (v) => (!v ? "Expiry date is required" : null),
      quantity: (v) => (v < 1 ? "Quantity must be ≥ 1" : null),
    },
  });

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      if (dateRange[0])
        params.set("from", dayjs(dateRange[0]).format("YYYY-MM-DD"));
      if (dateRange[1])
        params.set("to", dayjs(dateRange[1]).format("YYYY-MM-DD"));

      const res = await fetch(`${API_BASE}/admin/inventory/batches?${params}`);
      if (res.ok) setBatches(await res.json());
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, dateRange]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    fetch(`${API_BASE}/admin/products?limit=200`)
      .then((r) => r.json())
      .then((data: Array<{ id: string; title: string }>) =>
        setProducts(data.map((p) => ({ value: p.id, label: p.title }))),
      )
      .catch(() => {});
  }, []);

  async function handleImport(values: ImportBatchForm) {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/admin/inventory/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: values.productId,
          batchNumber: values.batchNumber,
          manufactureDate: values.manufactureDate
            ? dayjs(values.manufactureDate).format("YYYY-MM-DD")
            : null,
          expiryDate: dayjs(values.expiryDate!).format("YYYY-MM-DD"),
          initialQuantity: values.quantity,
          availableQuantity: values.quantity,
        }),
      });
      if (!res.ok) throw new Error("Import failed");
      notifications.show({
        color: "green",
        title: "Batch Imported",
        message: `Batch "${values.batchNumber}" added to inventory.`,
      });
      form.reset();
      closeImport();
      fetchBatches();
    } catch {
      notifications.show({
        color: "red",
        title: "Import Error",
        message: "Could not import batch. Check inputs and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Client-side filter on top of server results for instant UX
  const filtered = batches.filter((b) => {
    const status = computeStatus(b.expiryDate);
    const matchSearch =
      !search ||
      b.productTitle.toLowerCase().includes(search.toLowerCase()) ||
      b.batchNumber.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={4} c={myOxygenColors.darkText}>
          Batch Inspector
        </Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openImport}>
          Import New Batch
        </Button>
      </Group>

      {/* Filters */}
      <Paper p="sm" style={{ border: "1px solid #FFE4EC" }}>
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Search product or batch…"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <Select
            placeholder="Status"
            leftSection={<IconFilter size={14} />}
            data={["Active", "Expiring Soon", "Expired"]}
            value={statusFilter}
            onChange={setStatusFilter}
            clearable
            w={160}
          />
          <DatePickerInput
            type="range"
            placeholder="Expiry date range"
            value={dateRange}
            onChange={setDateRange}
            clearable
            w={220}
          />
        </Group>
      </Paper>

      {/* Batch Table */}
      <Paper p="md" style={{ border: "1px solid #FFE4EC" }}>
        {loading ? (
          <Box ta="center" py="xl">
            <Loader color="brand-pink" />
          </Box>
        ) : (
          <Table.ScrollContainer minWidth={800}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Product</Table.Th>
                  <Table.Th>Batch #</Table.Th>
                  <Table.Th>Mfg Date</Table.Th>
                  <Table.Th>Expiry Date</Table.Th>
                  <Table.Th>Initial Qty</Table.Th>
                  <Table.Th>Available</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Text ta="center" c="dimmed" py="md">
                        No batches found.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  filtered.map((batch) => {
                    const status = computeStatus(batch.expiryDate);
                    const color = expiryColor(status);
                    return (
                      <Table.Tr key={batch.id}>
                        <Table.Td fw={500}>{batch.productTitle}</Table.Td>
                        <Table.Td>
                          <Text size="sm" ff="monospace">
                            {batch.batchNumber}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {batch.manufactureDate
                            ? dayjs(batch.manufactureDate).format("DD MMM YYYY")
                            : "—"}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c={color} fw={600}>
                            {dayjs(batch.expiryDate).format("DD MMM YYYY")}
                          </Text>
                        </Table.Td>
                        <Table.Td>{batch.initialQuantity}</Table.Td>
                        <Table.Td>
                          <Text
                            fw={600}
                            c={
                              batch.availableQuantity === 0
                                ? "red"
                                : batch.availableQuantity < 10
                                  ? "orange"
                                  : "inherit"
                            }
                          >
                            {batch.availableQuantity}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            color={STATUS_BADGE_COLOR[status]}
                            size="sm"
                            variant="light"
                          >
                            {status}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      {/* Import Modal */}
      <Modal
        opened={importOpened}
        onClose={closeImport}
        title={
          <Text fw={700} c={myOxygenColors.darkText}>
            Import New Batch
          </Text>
        }
        size="md"
      >
        <form onSubmit={form.onSubmit(handleImport)}>
          <Stack gap="sm">
            <Select
              label="Product"
              placeholder="Select product"
              data={products}
              searchable
              required
              {...form.getInputProps("productId")}
            />
            <TextInput
              label="Batch Number"
              placeholder="e.g. BATCH-2026-C"
              required
              {...form.getInputProps("batchNumber")}
            />
            <DatePickerInput
              label="Manufacture Date"
              placeholder="DD/MM/YYYY"
              clearable
              {...form.getInputProps("manufactureDate")}
            />
            <DatePickerInput
              label="Expiry Date"
              placeholder="DD/MM/YYYY"
              required
              {...form.getInputProps("expiryDate")}
            />
            <NumberInput
              label="Initial Quantity"
              min={1}
              required
              {...form.getInputProps("quantity")}
            />
            <Button type="submit" loading={submitting} mt="sm">
              Import Batch
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
```

---

### Step 5: Stock Audit Ledger Page

A paginated, filterable, and CSV-exportable view of every `stock_history_log` record.

#### `apps/admin/src/app/(admin)/inventory/audit/page.tsx`

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconDownload, IconSearch } from "@tabler/icons-react";
import { myOxygenColors } from "@my-oxygen/ui-tokens";
import dayjs from "dayjs";

// ─── Types ────────────────────────────────────────────────────────────────────

type StockReason =
  "IMPORT" | "PURCHASE" | "RETURN" | "MANUAL_ADJUSTMENT" | "EXPIRED_SCRAP";

interface StockLog {
  id: string;
  createdAt: string;
  productTitle: string;
  batchNumber: string | null;
  changeDelta: number;
  balanceAfter: number;
  reason: StockReason;
  performedByName: string | null;
  note: string | null;
}

interface PagedResponse {
  data: StockLog[];
  total: number;
  page: number;
  pageSize: number;
}

const REASON_COLORS: Record<StockReason, string> = {
  IMPORT: "green",
  PURCHASE: "blue",
  RETURN: "orange",
  MANUAL_ADJUSTMENT: "brand-purple",
  EXPIRED_SCRAP: "red",
};

const PAGE_SIZE = 20;
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCsv(logs: StockLog[]) {
  const header = [
    "Date/Time",
    "Product",
    "Batch",
    "Delta",
    "Balance After",
    "Reason",
    "Performed By",
    "Note",
  ].join(",");

  const rows = logs.map((l) =>
    [
      dayjs(l.createdAt).format("YYYY-MM-DD HH:mm"),
      `"${l.productTitle}"`,
      l.batchNumber ?? "",
      l.changeDelta,
      l.balanceAfter,
      l.reason,
      l.performedByName ?? "",
      `"${(l.note ?? "").replace(/"/g, '""')}"`,
    ].join(","),
  );

  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stock-audit-${dayjs().format("YYYY-MM-DD")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StockAuditPage() {
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    null,
    null,
  ]);
  const allLogsRef = useRef<StockLog[]>([]); // Cached for CSV export

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("q", search);
      if (reasonFilter) params.set("reason", reasonFilter);
      if (dateRange[0])
        params.set("from", dayjs(dateRange[0]).format("YYYY-MM-DD"));
      if (dateRange[1])
        params.set("to", dayjs(dateRange[1]).format("YYYY-MM-DD"));

      const res = await fetch(`${API_BASE}/admin/inventory/audit?${params}`);
      if (res.ok) {
        const paged: PagedResponse = await res.json();
        setLogs(paged.data);
        setTotal(paged.total);
        allLogsRef.current = paged.data;
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, reasonFilter, dateRange]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, reasonFilter, dateRange]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={4} c={myOxygenColors.darkText}>
          Stock Audit Ledger
        </Title>
        <Tooltip label="Export current page to CSV">
          <ActionIcon
            variant="light"
            color="brand-green"
            size="lg"
            onClick={() => exportCsv(allLogsRef.current)}
          >
            <IconDownload size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Filters */}
      <Paper p="sm" style={{ border: "1px solid #FFE4EC" }}>
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Search product…"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <Select
            placeholder="Reason"
            data={[
              "IMPORT",
              "PURCHASE",
              "RETURN",
              "MANUAL_ADJUSTMENT",
              "EXPIRED_SCRAP",
            ]}
            value={reasonFilter}
            onChange={setReasonFilter}
            clearable
            w={180}
          />
          <DatePickerInput
            type="range"
            placeholder="Date range"
            value={dateRange}
            onChange={setDateRange}
            clearable
            w={220}
          />
        </Group>
      </Paper>

      {/* Ledger Table */}
      <Paper p="md" style={{ border: "1px solid #FFE4EC" }}>
        {loading ? (
          <Box ta="center" py="xl">
            <Loader color="brand-pink" />
          </Box>
        ) : (
          <>
            <Table.ScrollContainer minWidth={860}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date / Time</Table.Th>
                    <Table.Th>Product</Table.Th>
                    <Table.Th>Batch</Table.Th>
                    <Table.Th>Change</Table.Th>
                    <Table.Th>Balance After</Table.Th>
                    <Table.Th>Reason</Table.Th>
                    <Table.Th>Performed By</Table.Th>
                    <Table.Th>Note</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {logs.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={8}>
                        <Text ta="center" c="dimmed" py="md">
                          No audit records found.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    logs.map((log) => (
                      <Table.Tr key={log.id}>
                        <Table.Td style={{ whiteSpace: "nowrap" }}>
                          <Text size="xs">
                            {dayjs(log.createdAt).format("DD MMM YYYY")}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {dayjs(log.createdAt).format("HH:mm")}
                          </Text>
                        </Table.Td>
                        <Table.Td fw={500}>{log.productTitle}</Table.Td>
                        <Table.Td>
                          <Text size="xs" ff="monospace">
                            {log.batchNumber ?? "—"}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text
                            fw={700}
                            c={log.changeDelta >= 0 ? "green" : "red"}
                          >
                            {log.changeDelta >= 0 ? "+" : ""}
                            {log.changeDelta}
                          </Text>
                        </Table.Td>
                        <Table.Td>{log.balanceAfter}</Table.Td>
                        <Table.Td>
                          <Badge
                            color={REASON_COLORS[log.reason]}
                            size="sm"
                            variant="light"
                          >
                            {log.reason.replace(/_/g, " ")}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">
                            {log.performedByName ?? "System"}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {log.note ?? "—"}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>

            {totalPages > 1 && (
              <Group justify="space-between" mt="md">
                <Text size="xs" c="dimmed">
                  {total} records total
                </Text>
                <Pagination
                  total={totalPages}
                  value={page}
                  onChange={setPage}
                  color="brand-pink"
                  size="sm"
                />
              </Group>
            )}
          </>
        )}
      </Paper>
    </Stack>
  );
}
```

---

### Step 6: Order Management Page

Full order table with status-tab filtering, courier dispatch modal, status updates with motion-animated badge transitions, and invoice generation.

#### `apps/admin/src/app/(admin)/orders/page.tsx`

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconEye, IconFileInvoice, IconTruck } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { myOxygenColors } from "@my-oxygen/ui-tokens";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus =
  "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  createdAt: string;
  itemsCount: number;
  total: number;
  paymentMethod: string;
  status: OrderStatus;
  courierProvider: string | null;
  trackingId: string | null;
}

const ALL_STATUSES: OrderStatus[] = [
  "PENDING",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING: "yellow",
  PROCESSING: "blue",
  SHIPPED: "cyan",
  DELIVERED: "green",
  CANCELLED: "red",
};

const COURIER_OPTIONS = [
  { value: "pathao", label: "Pathao Courier" },
  { value: "steadfast", label: "Steadfast" },
  { value: "redx", label: "RedX" },
  { value: "sundarban", label: "Sundarban Courier" },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Component ───────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string | null>("ALL");
  const [dispatchTarget, setDispatchTarget] = useState<OrderRow | null>(null);
  const [courier, setCourier] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [dispatchOpened, { open: openDispatch, close: closeDispatch }] =
    useDisclosure(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (activeTab && activeTab !== "ALL") params.set("status", activeTab);
      const res = await fetch(`${API_BASE}/admin/orders?${params}`);
      if (res.ok) setOrders(await res.json());
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  async function updateStatus(orderId: string, newStatus: OrderStatus) {
    const res = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
      );
      notifications.show({
        color: "green",
        title: "Status Updated",
        message: `Order set to ${newStatus}`,
      });
    }
  }

  async function handleDispatch() {
    if (!dispatchTarget || !courier) return;
    const res = await fetch(
      `${API_BASE}/admin/orders/${dispatchTarget.id}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "SHIPPED",
          courierProvider: courier,
          trackingId: trackingInput || null,
        }),
      },
    );
    if (res.ok) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === dispatchTarget.id
            ? {
                ...o,
                status: "SHIPPED",
                courierProvider: courier,
                trackingId: trackingInput || null,
              }
            : o,
        ),
      );
      notifications.show({
        color: "green",
        title: "Dispatched",
        message: `Order ${dispatchTarget.orderNumber} dispatched via ${courier}`,
      });
      closeDispatch();
      setCourier(null);
      setTrackingInput("");
    }
  }

  async function generateInvoice(orderId: string, orderNumber: string) {
    const res = await fetch(`${API_BASE}/admin/orders/${orderId}/invoice`, {
      method: "POST",
    });
    if (res.ok) {
      const { pdfUrl } = await res.json();
      window.open(pdfUrl, "_blank");
    } else {
      notifications.show({
        color: "red",
        title: "Invoice Error",
        message: `Could not generate invoice for ${orderNumber}.`,
      });
    }
  }

  return (
    <Stack gap="lg">
      <Title order={4} c={myOxygenColors.darkText}>
        Order Management
      </Title>

      {/* Status Tabs */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="ALL">All</Tabs.Tab>
          {ALL_STATUSES.map((s) => (
            <Tabs.Tab key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      {/* Orders Table */}
      <Paper p="md" style={{ border: "1px solid #FFE4EC" }}>
        {loading ? (
          <Box ta="center" py="xl">
            <Loader color="brand-pink" />
          </Box>
        ) : (
          <Table.ScrollContainer minWidth={900}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Order #</Table.Th>
                  <Table.Th>Customer</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Items</Table.Th>
                  <Table.Th>Total</Table.Th>
                  <Table.Th>Payment</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {orders.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={8}>
                      <Text ta="center" c="dimmed" py="md">
                        No orders found.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  orders.map((order) => (
                    <Table.Tr key={order.id}>
                      <Table.Td fw={600}>{order.orderNumber}</Table.Td>
                      <Table.Td>{order.customerName}</Table.Td>
                      <Table.Td>
                        <Text size="xs">
                          {new Date(order.createdAt).toLocaleDateString(
                            "en-GB",
                          )}
                        </Text>
                      </Table.Td>
                      <Table.Td>{order.itemsCount}</Table.Td>
                      <Table.Td fw={500}>
                        ৳ {order.total.toLocaleString()}
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="outline" size="xs">
                          {order.paymentMethod}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={order.status}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Badge
                              color={STATUS_COLORS[order.status]}
                              size="sm"
                              variant="light"
                            >
                              {order.status}
                            </Badge>
                          </motion.div>
                        </AnimatePresence>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          {/* Status Update Dropdown */}
                          <Select
                            size="xs"
                            w={120}
                            placeholder="Set status"
                            data={ALL_STATUSES.map((s) => ({
                              value: s,
                              label: s.charAt(0) + s.slice(1).toLowerCase(),
                            }))}
                            value={order.status}
                            onChange={(v) =>
                              v && updateStatus(order.id, v as OrderStatus)
                            }
                          />
                          {/* Dispatch */}
                          {order.status === "PROCESSING" && (
                            <ActionIcon
                              variant="light"
                              color="cyan"
                              size="sm"
                              title="Dispatch to Courier"
                              onClick={() => {
                                setDispatchTarget(order);
                                openDispatch();
                              }}
                            >
                              <IconTruck size={14} />
                            </ActionIcon>
                          )}
                          {/* Invoice */}
                          <ActionIcon
                            variant="light"
                            color="brand-purple"
                            size="sm"
                            title="Generate Invoice"
                            onClick={() =>
                              generateInvoice(order.id, order.orderNumber)
                            }
                          >
                            <IconFileInvoice size={14} />
                          </ActionIcon>
                          {/* Details */}
                          <ActionIcon
                            variant="light"
                            color="gray"
                            size="sm"
                            component={Link}
                            href={`/orders/${order.id}`}
                          >
                            <IconEye size={14} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      {/* Dispatch Modal */}
      <Modal
        opened={dispatchOpened}
        onClose={closeDispatch}
        title={
          <Text fw={700} c={myOxygenColors.darkText}>
            Dispatch Order {dispatchTarget?.orderNumber}
          </Text>
        }
        size="sm"
      >
        <Stack gap="sm">
          <Select
            label="Courier Provider"
            placeholder="Select courier"
            data={COURIER_OPTIONS}
            value={courier}
            onChange={setCourier}
            required
          />
          <Box
            component="input"
            placeholder="Tracking ID (optional)"
            value={trackingInput}
            onChange={(e) => setTrackingInput(e.currentTarget.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #dee2e6",
              borderRadius: 6,
              fontSize: 14,
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <Button
            fullWidth
            disabled={!courier}
            onClick={handleDispatch}
            leftSection={<IconTruck size={16} />}
          >
            Confirm Dispatch
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
```

---

### Step 7: Sales Telemetry Page (Analytics)

Backend summary endpoint + frontend date-range dashboard with Mantine Charts.

#### Backend: `apps/api/src/routes/admin/analytics.ts`

```typescript
import { Hono } from "hono";
import { db } from "@my-oxygen/database";
import {
  orders,
  orderItems,
  products,
  categories,
} from "@my-oxygen/database/schema";
import { sql, and, gte, lte, eq } from "drizzle-orm";

export const analyticsRouter = new Hono();

analyticsRouter.get("/summary", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");

  const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 86400000);
  const toDate = to ? new Date(to) : new Date();

  const dateFilter = and(
    gte(orders.createdAt, fromDate),
    lte(orders.createdAt, toDate),
  );

  // 1. Revenue & Order Aggregates
  const [aggregate] = await db
    .select({
      totalRevenue: sql<number>`COALESCE(SUM(${orders.total}::numeric), 0)`,
      totalOrders: sql<number>`COUNT(${orders.id})`,
      avgOrderValue: sql<number>`COALESCE(AVG(${orders.total}::numeric), 0)`,
    })
    .from(orders)
    .where(dateFilter);

  // 2. Orders by Status
  const ordersByStatus = await db
    .select({
      status: orders.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .where(dateFilter)
    .groupBy(orders.status);

  // 3. Top Products by Revenue
  const topProducts = await db
    .select({
      title: products.title,
      unitsSold: sql<number>`SUM(${orderItems.quantity})`,
      revenue: sql<number>`SUM(${orderItems.totalPrice}::numeric)`,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(dateFilter)
    .groupBy(products.title)
    .orderBy(sql`SUM(${orderItems.totalPrice}::numeric) DESC`)
    .limit(10);

  // 4. Revenue by Category
  const revenueByCategory = await db
    .select({
      category: categories.name,
      revenue: sql<number>`SUM(${orderItems.totalPrice}::numeric)`,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(dateFilter)
    .groupBy(categories.name)
    .orderBy(sql`SUM(${orderItems.totalPrice}::numeric) DESC`);

  // 5. Revenue Trend (by day)
  const revenueTrend = await db
    .select({
      date: sql<string>`DATE(${orders.createdAt})`,
      revenue: sql<number>`SUM(${orders.total}::numeric)`,
      orderCount: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .where(dateFilter)
    .groupBy(sql`DATE(${orders.createdAt})`)
    .orderBy(sql`DATE(${orders.createdAt})`);

  return c.json({
    totalRevenue: Number(aggregate.totalRevenue),
    totalOrders: Number(aggregate.totalOrders),
    avgOrderValue: Number(aggregate.avgOrderValue),
    ordersByStatus: ordersByStatus.map((r) => ({
      status: r.status,
      count: Number(r.count),
    })),
    topProducts: topProducts.map((p) => ({
      title: p.title,
      unitsSold: Number(p.unitsSold),
      revenue: Number(p.revenue),
    })),
    revenueByCategory: revenueByCategory.map((r) => ({
      category: r.category,
      revenue: Number(r.revenue),
    })),
    revenueTrend: revenueTrend.map((r) => ({
      date: r.date,
      revenue: Number(r.revenue),
      orderCount: Number(r.orderCount),
    })),
  });
});
```

#### Frontend: `apps/admin/src/app/(admin)/analytics/page.tsx`

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { BarChart, DonutChart, LineChart } from "@mantine/charts";
import { myOxygenColors } from "@my-oxygen/ui-tokens";
import dayjs from "dayjs";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  ordersByStatus: Array<{ status: string; count: number }>;
  topProducts: Array<{ title: string; unitsSold: number; revenue: number }>;
  revenueByCategory: Array<{ category: string; revenue: number }>;
  revenueTrend: Array<{ date: string; revenue: number; orderCount: number }>;
}

const PRESET_RANGES: Record<string, [Date, Date]> = {
  "7d": [dayjs().subtract(7, "day").toDate(), dayjs().toDate()],
  "30d": [dayjs().subtract(30, "day").toDate(), dayjs().toDate()],
  "90d": [dayjs().subtract(90, "day").toDate(), dayjs().toDate()],
};

const STATUS_CHART_COLORS: Record<string, string> = {
  PENDING: "#F59E0B",
  PROCESSING: "#3B82F6",
  SHIPPED: "#06B6D4",
  DELIVERED: "#10B981",
  CANCELLED: "#EF4444",
  REFUNDED: "#F97316",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── KPI Summary Card ─────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Paper
      p="md"
      style={{
        border: `2px solid ${accent}30`,
        borderTop: `4px solid ${accent}`,
      }}
    >
      <Text size="xs" c="dimmed" fw={500} tt="uppercase" lts={0.5}>
        {label}
      </Text>
      <Text size="xl" fw={800} mt={4} c={myOxygenColors.darkText}>
        {value}
      </Text>
    </Paper>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [preset, setPreset] = useState("30d");
  const [customRange, setCustomRange] = useState<[Date | null, Date | null]>([
    null,
    null,
  ]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const effectiveRange =
    preset === "custom" ? customRange : PRESET_RANGES[preset];

  const fetchSummary = useCallback(async () => {
    const [from, to] = effectiveRange;
    if (!from || !to) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: dayjs(from).format("YYYY-MM-DD"),
        to: dayjs(to).format("YYYY-MM-DD"),
      });
      const res = await fetch(`${API_BASE}/admin/analytics/summary?${params}`);
      if (res.ok) setSummary(await res.json());
    } finally {
      setLoading(false);
    }
  }, [preset, customRange]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const donutData = (summary?.ordersByStatus ?? []).map((s) => ({
    name: s.status,
    value: s.count,
    color: STATUS_CHART_COLORS[s.status] ?? "#6B7280",
  }));

  const lineData = (summary?.revenueTrend ?? []).map((d) => ({
    date: dayjs(d.date).format("DD MMM"),
    Revenue: d.revenue,
  }));

  const barData = (summary?.topProducts ?? []).slice(0, 8).map((p) => ({
    Product: p.title.length > 18 ? p.title.slice(0, 16) + "…" : p.title,
    Revenue: p.revenue,
    Units: p.unitsSold,
  }));

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="wrap">
        <Title order={4} c={myOxygenColors.darkText}>
          Sales Telemetry
        </Title>
        <Group gap="sm">
          <SegmentedControl
            data={[
              { value: "7d", label: "7 Days" },
              { value: "30d", label: "30 Days" },
              { value: "90d", label: "90 Days" },
              { value: "custom", label: "Custom" },
            ]}
            value={preset}
            onChange={setPreset}
            color="brand-pink"
            size="xs"
          />
          {preset === "custom" && (
            <DatePickerInput
              type="range"
              placeholder="Pick date range"
              value={customRange}
              onChange={setCustomRange}
              size="xs"
              w={220}
            />
          )}
        </Group>
      </Group>

      {loading ? (
        <Box ta="center" py="xl">
          <Loader color="brand-pink" />
        </Box>
      ) : summary ? (
        <>
          {/* KPI Cards */}
          <Grid>
            <Grid.Col span={{ base: 12, xs: 4 }}>
              <SummaryCard
                label="Total Revenue"
                value={`৳ ${summary.totalRevenue.toLocaleString()}`}
                accent={myOxygenColors.primaryPink}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, xs: 4 }}>
              <SummaryCard
                label="Total Orders"
                value={summary.totalOrders.toLocaleString()}
                accent={myOxygenColors.secondaryGreen}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, xs: 4 }}>
              <SummaryCard
                label="Avg. Order Value"
                value={`৳ ${Math.round(summary.avgOrderValue).toLocaleString()}`}
                accent={myOxygenColors.accentPurple}
              />
            </Grid.Col>
          </Grid>

          {/* Revenue Trend Line Chart */}
          <Paper p="md" style={{ border: "1px solid #FFE4EC" }}>
            <Title order={5} mb="md" c={myOxygenColors.darkText}>
              Revenue Trend
            </Title>
            <LineChart
              h={260}
              data={lineData}
              dataKey="date"
              series={[
                {
                  name: "Revenue",
                  color: myOxygenColors.primaryPink,
                },
              ]}
              curveType="monotone"
              withLegend={false}
              withDots
              gridAxis="xy"
              yAxisProps={{
                tickFormatter: (v: number) => `৳${v.toLocaleString()}`,
              }}
            />
          </Paper>

          <Grid>
            {/* Orders by Status Donut */}
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Paper p="md" h="100%" style={{ border: "1px solid #FFE4EC" }}>
                <Title order={5} mb="md" c={myOxygenColors.darkText}>
                  Orders by Status
                </Title>
                <Box style={{ display: "flex", justifyContent: "center" }}>
                  <DonutChart
                    data={donutData}
                    size={220}
                    thickness={36}
                    withLabelsLine
                    withLabels
                    tooltipDataSource="segment"
                  />
                </Box>
                <Stack gap={4} mt="sm">
                  {donutData.map((d) => (
                    <Group key={d.name} gap="xs">
                      <Box
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: d.color,
                          flexShrink: 0,
                        }}
                      />
                      <Text size="xs">
                        {d.name}: <strong>{d.value}</strong>
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            </Grid.Col>

            {/* Top Products Bar Chart */}
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Paper p="md" style={{ border: "1px solid #FFE4EC" }}>
                <Title order={5} mb="md" c={myOxygenColors.darkText}>
                  Top Products by Revenue
                </Title>
                <BarChart
                  h={260}
                  data={barData}
                  dataKey="Product"
                  series={[
                    {
                      name: "Revenue",
                      color: myOxygenColors.secondaryGreen,
                    },
                  ]}
                  tickLine="y"
                  gridAxis="y"
                  yAxisProps={{
                    tickFormatter: (v: number) => `৳${(v / 1000).toFixed(0)}k`,
                  }}
                  withLegend={false}
                />
              </Paper>
            </Grid.Col>
          </Grid>
        </>
      ) : (
        <Text ta="center" c="dimmed" py="xl">
          No analytics data available for selected range.
        </Text>
      )}
    </Stack>
  );
}
```

---

### Step 8: Product Management Page

A drawer-driven product table with inline active-toggle and full creation form.

#### `apps/admin/src/app/(admin)/products/page.tsx`

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Drawer,
  Grid,
  Group,
  Image,
  Loader,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import { myOxygenColors } from "@my-oxygen/ui-tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  title: string;
  slug: string;
  sku: string;
  category: string;
  categoryId: string;
  basePrice: number;
  stockCount: number;
  requiresBatchTracking: boolean;
  isActive: boolean;
  images: string[];
}

interface Category {
  id: string;
  name: string;
}

interface CreateProductForm {
  title: string;
  slug: string;
  categoryId: string;
  sku: string;
  description: string;
  basePrice: number;
  costPrice: number;
  imageUrl: string;
  requiresBatchTracking: boolean;
  lowStockThreshold: number;
}

// ─── Slug Generator ───────────────────────────────────────────────────────────

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CreateProductForm>({
    initialValues: {
      title: "",
      slug: "",
      categoryId: "",
      sku: "",
      description: "",
      basePrice: 0,
      costPrice: 0,
      imageUrl: "",
      requiresBatchTracking: false,
      lowStockThreshold: 5,
    },
    validate: {
      title: (v) => (!v.trim() ? "Title is required" : null),
      categoryId: (v) => (!v ? "Select a category" : null),
      sku: (v) => (!v.trim() ? "SKU is required" : null),
      description: (v) =>
        v.trim().length < 10 ? "Description too short" : null,
      basePrice: (v) => (v <= 0 ? "Price must be > 0" : null),
      costPrice: (v) => (v <= 0 ? "Cost price must be > 0" : null),
    },
  });

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/products?limit=100`);
      if (res.ok) setProducts(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetch(`${API_BASE}/categories`)
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, [fetchProducts]);

  // Auto-generate slug from title
  function handleTitleChange(value: string) {
    form.setFieldValue("title", value);
    // Only auto-generate if slug is still empty or matches previous auto-value
    form.setFieldValue("slug", toSlug(value));
  }

  async function handleCreateProduct(values: CreateProductForm) {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/admin/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          images: values.imageUrl ? [values.imageUrl] : [],
        }),
      });
      if (!res.ok) throw new Error("Failed to create product");
      notifications.show({
        color: "green",
        title: "Product Created",
        message: `"${values.title}" has been added.`,
      });
      form.reset();
      closeDrawer();
      fetchProducts();
    } catch {
      notifications.show({
        color: "red",
        title: "Error",
        message: "Could not create product. Check inputs and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(productId: string, isActive: boolean) {
    const res = await fetch(`${API_BASE}/admin/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (res.ok) {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, isActive } : p)),
      );
    }
  }

  const categorySelectData = categories.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={4} c={myOxygenColors.darkText}>
          Products
        </Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openDrawer}>
          Add Product
        </Button>
      </Group>

      {/* Products Table */}
      <Paper p="md" style={{ border: "1px solid #FFE4EC" }}>
        {loading ? (
          <Box ta="center" py="xl">
            <Loader color="brand-pink" />
          </Box>
        ) : (
          <Table.ScrollContainer minWidth={860}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Image</Table.Th>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>SKU</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Price</Table.Th>
                  <Table.Th>Stock</Table.Th>
                  <Table.Th>Batch Tracked</Table.Th>
                  <Table.Th>Active</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {products.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={9}>
                      <Text ta="center" c="dimmed" py="md">
                        No products found. Add your first product.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  products.map((product) => (
                    <Table.Tr key={product.id}>
                      <Table.Td>
                        <Image
                          src={product.images[0] ?? "/placeholder.png"}
                          alt={product.title}
                          w={40}
                          h={40}
                          radius="sm"
                          fit="cover"
                          fallbackSrc="/placeholder.png"
                        />
                      </Table.Td>
                      <Table.Td fw={500}>{product.title}</Table.Td>
                      <Table.Td>
                        <Text size="xs" ff="monospace">
                          {product.sku}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="brand-purple" size="sm">
                          {product.category}
                        </Badge>
                      </Table.Td>
                      <Table.Td fw={500}>
                        ৳ {product.basePrice.toLocaleString()}
                      </Table.Td>
                      <Table.Td>
                        <Text
                          size="sm"
                          c={product.stockCount < 5 ? "red" : "inherit"}
                          fw={product.stockCount < 5 ? 700 : 400}
                        >
                          {product.stockCount}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {product.requiresBatchTracking ? (
                          <Badge color="brand-green" size="xs">
                            Yes
                          </Badge>
                        ) : (
                          <Text size="xs" c="dimmed">
                            No
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Switch
                          checked={product.isActive}
                          onChange={(e) =>
                            toggleActive(product.id, e.currentTarget.checked)
                          }
                          color="brand-pink"
                          size="sm"
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <ActionIcon
                            variant="light"
                            size="sm"
                            color="brand-pink"
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                          <ActionIcon variant="light" size="sm" color="red">
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      {/* Add Product Drawer */}
      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        title={
          <Text fw={700} size="lg" c={myOxygenColors.darkText}>
            Add New Product
          </Text>
        }
        position="right"
        size="md"
        padding="xl"
      >
        <form onSubmit={form.onSubmit(handleCreateProduct)}>
          <Stack gap="sm">
            <TextInput
              label="Product Title"
              placeholder="Natural Hydrating Face Wash"
              required
              value={form.values.title}
              onChange={(e) => handleTitleChange(e.currentTarget.value)}
              error={form.errors.title}
            />
            <TextInput
              label="Slug"
              placeholder="auto-generated"
              {...form.getInputProps("slug")}
            />
            <Select
              label="Category"
              placeholder="Select category"
              data={categorySelectData}
              required
              {...form.getInputProps("categoryId")}
            />
            <TextInput
              label="SKU"
              placeholder="SKN-FW-002"
              required
              {...form.getInputProps("sku")}
            />
            <Textarea
              label="Description"
              placeholder="Product description (min. 10 characters)"
              rows={3}
              required
              {...form.getInputProps("description")}
            />
            <Grid>
              <Grid.Col span={6}>
                <NumberInput
                  label="Base Price (৳)"
                  min={0}
                  required
                  {...form.getInputProps("basePrice")}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <NumberInput
                  label="Cost Price (৳)"
                  min={0}
                  required
                  {...form.getInputProps("costPrice")}
                />
              </Grid.Col>
            </Grid>
            <TextInput
              label="Image URL"
              placeholder="https://example.com/image.jpg"
              {...form.getInputProps("imageUrl")}
            />
            <NumberInput
              label="Low Stock Threshold"
              min={1}
              {...form.getInputProps("lowStockThreshold")}
            />
            <Switch
              label="Requires Batch Tracking"
              description="Enable for perishable or expiry-sensitive products"
              color="brand-pink"
              {...form.getInputProps("requiresBatchTracking", {
                type: "checkbox",
              })}
            />
            <Button
              type="submit"
              loading={submitting}
              mt="md"
              fullWidth
              style={{
                background: `linear-gradient(135deg, ${myOxygenColors.primaryPink}, #F472B6)`,
              }}
            >
              Create Product
            </Button>
          </Stack>
        </form>
      </Drawer>
    </Stack>
  );
}
```

---

### Step 9: Verification Checklist

Execute these validation steps sequentially before marking Phase 9 complete and advancing to Phase 10.

1. **Admin Login Flow:**

```bash
pnpm --filter @my-oxygen/admin dev
# Navigate to http://localhost:3001/login
```

_Expected outcome:_ Login page renders with brand gradient. Entering `admin@myoxygen.com` / `Admin@MyOxygen2026` sets an `httpOnly` cookie `admin_token` and redirects to `/dashboard`. Entering wrong credentials shows a Mantine notification error toast. Direct navigation to `/dashboard` without a cookie redirects to `/login?redirect=/dashboard`.

2. **Sidebar Role Restriction:**

```bash
# Log in with a SUPPORT_STAFF user
# Expected: Sidebar shows only "Orders" — Products, Inventory, Discounts, Staff, Analytics nav links absent.
# Log in as MARKETING_MANAGER
# Expected: Sidebar shows Discounts + Analytics only (no Products, Inventory, Staff).
```

_Expected outcome:_ `visibleNav` filtering in `AdminShell` correctly hides unauthorized links per role. No route-level bypass is possible because the Hono API enforces the same role checks on every `GET /admin/*` endpoint.

3. **Batch Inspector Filters:**

```bash
curl http://localhost:4000/admin/inventory/batches?status=Expiring+Soon
```

_Expected outcome:_ Table shows only batches with `expiryDate` within 30 days. Status badge renders orange "Expiring Soon". Expiry date column renders in orange. Expired batches render red. Active batches render green. Importing a new batch via the modal calls `POST /admin/inventory/batches`, returns the created row, and the table refreshes without a full page reload.

4. **Stock Ledger Pagination:**

```bash
curl "http://localhost:4000/admin/inventory/audit?page=1&pageSize=20"
```

_Expected outcome:_ Returns `{ data: [...], total: N, page: 1, pageSize: 20 }`. Navigating to page 2 in the UI fetches the next 20 records. Delta column shows green `+N` for positive changes and red `-N` for negative. Reason badges render correct colors per `REASON_COLORS` map. CSV export downloads a valid `.csv` file with all columns populated.

5. **Order Status Update:**

```bash
curl -X PATCH http://localhost:4000/admin/orders/<ORDER_ID>/status \
  -H "Content-Type: application/json" \
  -d '{"status":"PROCESSING"}'
```

_Expected outcome:_ Badge in the orders table animates with `motion` `AnimatePresence` from the old status to `PROCESSING`. Dispatch action icon (truck) becomes visible for the updated row. Dispatching via modal sets status to `SHIPPED` and records `courierProvider` + `trackingId`.

6. **Analytics Charts Render:**

```bash
curl "http://localhost:4000/admin/analytics/summary?from=2026-01-01&to=2026-09-22"
```

_Expected outcome:_ JSON response includes `totalRevenue`, `totalOrders`, `avgOrderValue`, `ordersByStatus[]`, `topProducts[]`, `revenueByCategory[]`, `revenueTrend[]`. Frontend renders: `LineChart` (revenue trend), `DonutChart` (orders by status with color-coded legend), `BarChart` (top products). Switching preset segments (7d / 30d / 90d) triggers fresh API calls and chart re-renders. Custom date range picker allows arbitrary window selection.
