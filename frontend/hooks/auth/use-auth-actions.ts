"use client";

import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import { compactPhone, normalizeBangladeshMobile } from "../../lib/phone";
import type { AuthSessionDTO, LoginPayload, RegisterPayload } from "../../types/auth";

/**
 * The identifier sent to `/auth/login`. The API stores phones canonically
 * (01XXXXXXXXX) and normalises whatever it receives, so one attempt suffices.
 */
function loginIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }
  return normalizeBangladeshMobile(trimmed) ?? compactPhone(trimmed);
}

export interface AuthActions {
  /** `POST /auth/login`; stores the session on success. Throws `ApiError`. */
  login: (payload: LoginPayload) => Promise<AuthSessionDTO>;
  /** `POST /auth/register` (phone normalised to 01XXXXXXXXX); stores the session. Throws `ApiError`. */
  register: (payload: RegisterPayload) => Promise<AuthSessionDTO>;
  /** Clears the session and every cached SWR response (orders, profile, …). */
  logout: () => Promise<void>;
}

export function useAuthActions(): AuthActions {
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearSession = useAuthStore((state) => state.logout);
  const { mutate } = useSWRConfig();

  const persist = useCallback(
    (session: AuthSessionDTO) => {
      setAuth({ user: session.user, accessToken: session.accessToken, refreshToken: session.refreshToken });
      return session;
    },
    [setAuth]
  );

  const login = useCallback(
    async ({ identifier, password }: LoginPayload) => {
      const session = await api.post<AuthSessionDTO>(
        "/auth/login",
        { identifier: loginIdentifier(identifier), password },
        { auth: false }
      );
      return persist(session);
    },
    [persist]
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const phone = normalizeBangladeshMobile(payload.phone) ?? compactPhone(payload.phone);
      const email = payload.email?.trim() ? payload.email.trim().toLowerCase() : null;
      const session = await api.post<AuthSessionDTO>(
        "/auth/register",
        { fullName: payload.fullName.trim(), phone, email, password: payload.password },
        { auth: false }
      );
      return persist(session);
    },
    [persist]
  );

  const logout = useCallback(async () => {
    clearSession();
    await mutate(() => true, undefined, { revalidate: false });
  }, [clearSession, mutate]);

  return { login, register, logout };
}
