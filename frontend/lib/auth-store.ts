"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { UserRole } from "../types";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  role: UserRole | string;
}

export type SetAuthPayload =
  | {
      user: AuthUser;
      accessToken: string;
      refreshToken?: string | null;
      tokens?: never;
    }
  | {
      user: AuthUser;
      tokens: { accessToken: string; refreshToken?: string | null };
      accessToken?: never;
      refreshToken?: never;
    }
  | {
      user: AuthUser;
      accessToken?: string;
      refreshToken?: string | null;
      tokens?: { accessToken: string; refreshToken?: string | null };
    };

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (payload: SetAuthPayload) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      setAuth: (payload) => {
        if (!payload) return;
        const token =
          payload.accessToken ||
          payload.tokens?.accessToken ||
          "";
        const refresh =
          payload.refreshToken ||
          payload.tokens?.refreshToken ||
          null;

        if (typeof window !== "undefined" && token) {
          localStorage.setItem("my_oxygen_token", token);
          if (refresh) {
            localStorage.setItem("my_oxygen_refresh_token", refresh);
          }
        }

        set({
          user: payload.user,
          accessToken: token || null,
          refreshToken: refresh,
          isAuthenticated: Boolean(payload.user && token),
          isLoading: false,
        });
      },

      logout: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("my_oxygen_token");
          localStorage.removeItem("my_oxygen_refresh_token");
          localStorage.removeItem("my_oxygen_auth");
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },
    }),
    {
      name: "my_oxygen_auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
