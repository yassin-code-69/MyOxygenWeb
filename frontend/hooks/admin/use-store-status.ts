"use client";

import useSWR from "swr";
import { api, ApiError } from "../../lib/api-client";
import type { StoreHealth } from "../../types/admin-dashboard";

const HEALTH_KEY = "/health";

function isStoreHealth(value: unknown): value is StoreHealth {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const status = (value as Record<string, unknown>).status;
  return status === "UP" || status === "DOWN";
}

/**
 * `GET /health` is a platform endpoint that is not wrapped in the success
 * envelope, so it is read through the client's raw (`blob`) transport and
 * parsed here. A 503 (database down) or a network failure rejects.
 */
async function healthFetcher(path: string): Promise<StoreHealth> {
  const body = await api.blob(path, undefined, "application/json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await body.text());
  } catch {
    throw new ApiError("The health check returned an unreadable response.", 200, "INVALID_RESPONSE");
  }
  if (!isStoreHealth(parsed)) {
    throw new ApiError("The health check returned an unexpected response.", 200, "INVALID_RESPONSE");
  }
  return parsed;
}

export type StoreStatus = "online" | "offline" | "checking";

/**
 * Live store status for the dashboard pill: `online` when the API answers
 * `UP` with the database connected, `offline` when it is unreachable or
 * reports `DOWN`, `checking` before the first answer. Re-checked every 30 s.
 */
export function useStoreStatus() {
  const swr = useSWR<StoreHealth, ApiError, string>(HEALTH_KEY, healthFetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
    dedupingInterval: 5_000,
  });
  let status: StoreStatus = "checking";
  if (swr.error) {
    status = "offline";
  } else if (swr.data) {
    status = swr.data.status === "UP" && swr.data.database === "CONNECTED" ? "online" : "offline";
  }
  return { ...swr, status };
}
