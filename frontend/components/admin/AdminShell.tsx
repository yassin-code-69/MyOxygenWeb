"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Box, Drawer, MantineThemeProvider } from "@mantine/core";
import { useDisclosure, useMounted } from "@mantine/hooks";
import { SWRConfig, type SWRConfiguration } from "swr";
import { getAdminHomeHref, getAdminNavItems, getAdminNavTree } from "../../lib/admin-nav";
import { isApiError } from "../../lib/api-client";
import { useAuthStore, type AuthUser } from "../../lib/auth-store";
import { useAuthActions } from "../../hooks/auth/use-auth-actions";
import { useAdminAlertCounts } from "../../hooks/admin/use-telemetry";
import { isStaffRole } from "../../types/auth";
import { startPageProgress } from "../PageProgressBar";
import { adminTheme } from "./admin-theme";
import { AdminBrand } from "./AdminBrand";
import { AdminCommandPalette } from "./AdminCommandPalette";
import { AdminHeader } from "./AdminHeader";
import { AdminBootSkeleton, AdminCustomerBlocked, AdminPageSkeleton } from "./AdminScreens";
import { AdminSidebar, useNavOpenState } from "./AdminSidebar";
import classes from "./AdminShell.module.css";

export const ADMIN_HEADER_HEIGHT = 72;
export const ADMIN_NAVBAR_WIDTH = 260;

export interface AdminShellProps {
  children: ReactNode;
  /** App version shown in the sidebar footer (read from package.json at build time). */
  version?: string;
}

/**
 * Back-office chrome and access guard for every `/admin` route.
 *
 * 1. Waits for mount and the persisted session (`hasHydrated`) before deciding anything.
 * 2. Signed out (or the session expired and the refresh failed) →
 *    `/login?redirect=<current path>`.
 * 3. CUSTOMER → 403 screen with a link back to the store.
 * 4. Staff → permission-filtered sidebar, header (search palette, alerts,
 *    profile) and the page.
 *
 * Pages add their own `<RequirePermission>` for the exact permission they need.
 */
export function AdminShell({ children, version = "0.0.0" }: AdminShellProps) {
  const router = useRouter();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  // Clears the session AND every cached SWR response, so a second staff account
  // signing in on the same tab never sees the previous user's admin data.
  const { logout: signOut } = useAuthActions();
  const logout = useCallback(() => {
    void signOut();
  }, [signOut]);
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

  return (
    <SWRConfig value={swrConfig}>
      <MantineThemeProvider theme={adminTheme}>
        <AdminChrome user={user} version={version} onLogout={handleLogout}>
          {children}
        </AdminChrome>
      </MantineThemeProvider>
    </SWRConfig>
  );
}

interface AdminChromeProps {
  user: AuthUser;
  version: string;
  onLogout: () => void;
  children: ReactNode;
}

/** The signed-in staff layout (mockup): full-height sidebar, header, neutral canvas. */
function AdminChrome({ user, version, onLogout, children }: AdminChromeProps) {
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);
  const tree = useMemo(() => getAdminNavTree(user.role), [user.role]);
  const navItems = useMemo(() => getAdminNavItems(user.role), [user.role]);
  const homeHref = getAdminHomeHref(user.role) ?? "/admin";
  const nav = useNavOpenState(user.id);
  const counts = useAdminAlertCounts();

  return (
    <>
      <AppShell
        layout="alt"
        header={{ height: ADMIN_HEADER_HEIGHT }}
        navbar={{ width: ADMIN_NAVBAR_WIDTH, breakpoint: "md", collapsed: { mobile: true } }}
        padding={{ base: "md", sm: "lg" }}
      >
        <AppShell.Header className={classes.header}>
          <AdminHeader user={user} homeHref={homeHref} navOpened={navOpened} onToggleNav={toggleNav} onLogout={onLogout} />
        </AppShell.Header>

        <AppShell.Navbar className={classes.navbar}>
          <AdminSidebar tree={tree} homeHref={homeHref} version={version} counts={counts} nav={nav} idPrefix="admin-nav" />
        </AppShell.Navbar>

        <AppShell.Main id="main-content" className={classes.main}>
          <Box maw={1480} mx="auto">
            <Suspense fallback={<AdminPageSkeleton />}>{children}</Suspense>
          </Box>
        </AppShell.Main>
      </AppShell>

      <Drawer
        opened={navOpened}
        onClose={closeNav}
        hiddenFrom="md"
        size={290}
        padding={0}
        title={<AdminBrand href={homeHref} onNavigate={closeNav} />}
        aria-label="Back-office navigation"
        styles={{ header: { paddingInline: 20, minHeight: ADMIN_HEADER_HEIGHT }, body: { height: `calc(100% - ${ADMIN_HEADER_HEIGHT}px)` } }}
      >
        <AdminSidebar
          tree={tree}
          homeHref={homeHref}
          version={version}
          counts={counts}
          nav={nav}
          onNavigate={closeNav}
          showBrand={false}
          idPrefix="admin-drawer-nav"
        />
      </Drawer>

      <AdminCommandPalette navItems={navItems} />
    </>
  );
}
