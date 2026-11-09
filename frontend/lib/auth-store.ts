"use client";

/**
 * Client-side session store (persisted to localStorage under `my_oxygen_auth`).
 *
 * - `hasHydrated` turns true once the persisted session has been read. Route
 *   guards must wait for it before deciding a visitor is logged out.
 * - `lib/api-client.ts` reads the tokens from here, refreshes the access token
 *   on a 401 (`setAccessToken`) and calls `logout()` when the refresh fails.
 * - Never read or write tokens through localStorage directly.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { UserRole } from "../types/auth";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  role: UserRole;
}

export interface SetAuthPayload {
  user: AuthUser;
  accessToken: string;
  refreshToken?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  /** True once the persisted session has been restored on the client. */
  hasHydrated: boolean;

  setAuth: (payload: SetAuthPayload) => void;
  /** Replaces the access token after a successful `/auth/refresh`. */
  setAccessToken: (accessToken: string) => void;
  /** Merges profile changes (e.g. from `/auth/me`) into the stored user. */
  updateUser: (patch: Partial<Omit<AuthUser, "id">>) => void;
  logout: () => void;
  /** Internal: flips `hasHydrated` once persist has read storage. */
  markHydrated: () => void;
}

/** Keys written by the pre-remediation client; removed on every auth change. */
const LEGACY_STORAGE_KEYS = ["my_oxygen_token", "my_oxygen_refresh_token", "my_oxygen_user"] as const;

function clearLegacyKeys(): void {
  if (typeof window === "undefined") {return;}
  try {
    for (const key of LEGACY_STORAGE_KEYS) {window.localStorage.removeItem(key);}
  } catch {
    // Storage can be unavailable (private mode, blocked site data); nothing to clean then.
  }
}

const SIGNED_OUT = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
} as const;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...SIGNED_OUT,
      hasHydrated: false,

      setAuth: ({ user, accessToken, refreshToken }) => {
        clearLegacyKeys();
        set({
          user,
          accessToken,
          refreshToken: refreshToken ?? get().refreshToken,
          isAuthenticated: Boolean(user && accessToken),
        });
      },

      setAccessToken: (accessToken) => {
        set({ accessToken, isAuthenticated: Boolean(get().user && accessToken) });
      },

      updateUser: (patch) => {
        const current = get().user;
        if (!current) {return;}
        set({ user: { ...current, ...patch } });
      },

      logout: () => {
        clearLegacyKeys();
        set({ ...SIGNED_OUT });
      },

      markHydrated: () => {
        set({ hasHydrated: true });
      },
    }),
    {
      name: "my_oxygen_auth",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // Sessions persisted by older builds are dropped: their tokens were signed
      // with the rotated secret and no longer verify.
      migrate: () => ({ ...SIGNED_OUT }),
      // persist reads localStorage synchronously inside create(), before
      // `useAuthStore` is assigned, so the callback must not reference it.
      // Use the store's own action from the initial state instead.
      onRehydrateStorage: (initialState) => () => {
        initialState.markHydrated();
      },
    },
  ),
);

/** True for any role allowed into the `/admin` back-office. */
export function selectIsStaff(state: Pick<AuthState, "user">): boolean {
  return state.user !== null && state.user.role !== "CUSTOMER";
}
