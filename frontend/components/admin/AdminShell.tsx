"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell, Box, Burger, Button, Divider, Drawer, Group, Text } from "@mantine/core";
import { useDisclosure, useMounted } from "@mantine/hooks";
import { IconBuildingStore } from "@tabler/icons-react";
import { SWRConfig, type SWRConfiguration } from "swr";
import { findAdminNavItem, getAdminHomeHref, getAdminNavItems } from "../../lib/admin-nav";
import { isApiError } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import { useAuthActions } from "../../hooks/auth/use-auth-actions";
import { isStaffRole } from "../../types/auth";
import { startPageProgress } from "../PageProgressBar";
import { AdminAlerts } from "./AdminAlerts";
import { AdminBrand } from "./AdminBrand";
import { AdminBootSkeleton, AdminCustomerBlocked, AdminPageSkeleton } from "./AdminScreens";
import { AdminSidebar } from "./AdminSidebar";
import { AdminUserMenu } from "./AdminUserMenu";

const HEADER_HEIGHT = 64;
const NAVBAR_WIDTH = 272;

/**
 * Back-office chrome and access guard for every `/admin` route.
 *
 * 1. Waits for mount and the persisted session (`hasHydrated`) before deciding anything.
 * 2. Signed out (or the session expired and the refresh failed) →
 *    `/login?redirect=<current path>`.
 * 3. CUSTOMER → 403 screen with a link back to the store.
 * 4. Staff → sidebar filtered by permission, header with real user + alerts.
 *
 * Pages add their own `<RequirePermission>` for the exact permission they need.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  // Clears the session AND every cached SWR response, so a second staff account
  // signing in on the same tab never sees the previous user's admin data.
  const { logout: signOut } = useAuthActions();
  const logout = useCallback(() => {
    void signOut();
  }, [signOut]);
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);
  const explicitLogout = useRef(false);
  // The persisted session is read synchronously on the client, so the first client render must
  // match the server (boot skeleton) before the session decides anything — no hydration mismatch.
  const mounted = useMounted();

  const signedOut = mounted && hasHydrated && (!isAuthenticated || user === null);

  useEffect(() => {
    if (!signedOut) {
      return;
    }
    startPageProgress();
    if (explicitLogout.current) {
      router.replace("/login");
      return;
    }
    const current = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?redirect=${encodeURIComponent(current)}`);
  }, [signedOut, router]);

  const handleLogout = useCallback(() => {
    explicitLogout.current = true;
    logout();
  }, [logout]);

  const swrConfig = useMemo<SWRConfiguration>(
    () => ({
      // A 401 that survived the client's refresh attempt means the session is gone.
      onError: (error: unknown) => {
        if (isApiError(error) && error.status === 401) {
          logout();
        }
      },
      // Client errors (403, 404, 422) won't fix themselves — don't retry them.
      onErrorRetry: (error: unknown, _key, _config, revalidate, { retryCount }) => {
        if (isApiError(error) && error.status >= 400 && error.status < 500) {
          return;
        }
        if (retryCount >= 3) {
          return;
        }
        window.setTimeout(() => {
          void revalidate({ retryCount });
        }, 2000 * 2 ** retryCount);
      },
    }),
    [logout],
  );

  if (!mounted || !hasHydrated || signedOut || user === null) {
    return <AdminBootSkeleton />;
  }

  if (!isStaffRole(user.role)) {
    return <AdminCustomerBlocked fullName={user.fullName} onSwitchAccount={logout} />;
  }

  const navItems = getAdminNavItems(user.role);
  const homeHref = getAdminHomeHref(user.role) ?? "/admin";
  const currentItem = findAdminNavItem(pathname);

  return (
    <SWRConfig value={swrConfig}>
      <AppShell
        header={{ height: HEADER_HEIGHT }}
        navbar={{ width: NAVBAR_WIDTH, breakpoint: "md", collapsed: { mobile: true } }}
        padding={{ base: "md", md: "lg" }}
      >
        <AppShell.Header bg="var(--mo-color-surface)">
          <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="sm">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <Burger
                opened={navOpened}
                onClick={toggleNav}
                hiddenFrom="md"
                size="sm"
                aria-label={navOpened ? "Close navigation" : "Open navigation"}
              />
              <AdminBrand href={homeHref} />
              {currentItem ? (
                <Group gap="sm" wrap="nowrap" visibleFrom="md">
                  <Divider orientation="vertical" color="var(--mo-color-border)" />
                  <Text size="sm" fw={600} c="var(--mo-color-text-secondary)">
                    {currentItem.label}
                  </Text>
                </Group>
              ) : null}
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Button
                component={Link}
                href="/"
                variant="subtle"
                color="gray"
                size="sm"
                leftSection={<IconBuildingStore size={16} aria-hidden />}
                visibleFrom="lg"
              >
                View store
              </Button>
              <AdminAlerts />
              <AdminUserMenu user={user} onLogout={handleLogout} />
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md" bg="var(--mo-color-surface)">
          <AdminSidebar items={navItems} />
        </AppShell.Navbar>

        <AppShell.Main id="main-content" bg="var(--mo-color-canvas)">
          <Box maw={1480} mx="auto">
            <Suspense fallback={<AdminPageSkeleton />}>{children}</Suspense>
          </Box>
        </AppShell.Main>
      </AppShell>

      <Drawer
        opened={navOpened}
        onClose={closeNav}
        hiddenFrom="md"
        size={300}
        padding="md"
        title={<Text fw={700}>Menu</Text>}
        aria-label="Back-office navigation"
      >
        <AdminSidebar items={navItems} onNavigate={closeNav} />
      </Drawer>
    </SWRConfig>
  );
}
