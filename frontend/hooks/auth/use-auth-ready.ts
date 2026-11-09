"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMounted } from "@mantine/hooks";
import { startPageProgress } from "../../components/PageProgressBar";
import { useAuthStore, type AuthUser } from "../../lib/auth-store";
import { buildLoginHref } from "./redirect";

/**
 * True once the persisted session can be trusted on the client.
 *
 * The session is persisted to localStorage, which zustand reads synchronously
 * while `lib/auth-store.ts` initialises — so by the first client effect
 * (`mounted`) the tokens are in memory. The store's `hasHydrated` flag is
 * honoured as well; it is not relied on alone because its rehydration callback
 * currently references the store before `create()` returns and never flips
 * (reported to the foundation owner).
 */
export function useAuthReady(): boolean {
  const mounted = useMounted();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  return mounted || hasHydrated;
}

export type RequireAuthStatus = "checking" | "authenticated" | "redirecting";

export interface RequireAuthOptions {
  /** Set to false to stop redirecting (e.g. while the user is deliberately signing out). */
  redirect?: boolean;
}

export interface RequireAuthResult {
  status: RequireAuthStatus;
  user: AuthUser | null;
}

/**
 * Route guard for customer pages. Waits for the session to be restored, then
 * sends signed-out visitors to `/login?redirect=<returnTo>`. The same happens
 * if the session ends while the page is open (e.g. the refresh token expired).
 */
export function useRequireAuth(returnTo: string, { redirect = true }: RequireAuthOptions = {}): RequireAuthResult {
  const router = useRouter();
  const ready = useAuthReady();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const redirectedRef = useRef(false);

  const signedIn = isAuthenticated && user !== null;

  useEffect(() => {
    if (!ready || signedIn || !redirect || redirectedRef.current) {
      return;
    }
    redirectedRef.current = true;
    startPageProgress();
    router.replace(buildLoginHref(returnTo));
  }, [ready, signedIn, redirect, returnTo, router]);

  if (!ready) {
    return { status: "checking", user: null };
  }
  if (!signedIn) {
    return { status: "redirecting", user: null };
  }
  return { status: "authenticated", user };
}
