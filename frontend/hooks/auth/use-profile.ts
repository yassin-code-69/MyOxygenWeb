"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { api, type ApiError } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import type { MeDTO } from "../../types/auth";

/**
 * `GET /auth/me` for the signed-in user (keyed by user id so a different
 * account never sees a cached profile). Keeps the stored user in sync.
 */
export function useProfile(enabled = true) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const updateUser = useAuthStore((state) => state.updateUser);

  const key = enabled && isAuthenticated && userId ? (["/auth/me", userId] as const) : null;
  const { data, error, isLoading, mutate } = useSWR<MeDTO, ApiError, typeof key>(
    key,
    ([path]) => api.get<MeDTO>(path),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  useEffect(() => {
    if (data) {
      updateUser({ fullName: data.fullName, email: data.email, phone: data.phone, role: data.role });
    }
  }, [data, updateUser]);

  return { profile: data ?? null, error: error ?? null, isLoading, mutate };
}
