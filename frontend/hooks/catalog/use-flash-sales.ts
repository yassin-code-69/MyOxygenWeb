"use client";

import useSWR from "swr";
import { api, type ApiError } from "../../lib/api-client";
import type { CatalogFlashSaleDTO } from "../../types/catalog";

const FLASH_SALES_PATH = "/catalog/flash-sales";

/** Drops sales whose deadline already passed on this device (the API caches for 30 s). */
function stillRunning(sales: readonly CatalogFlashSaleDTO[], now: number): CatalogFlashSaleDTO[] {
  return sales.filter((sale) => {
    const endsAt = new Date(sale.endsAt).getTime();
    return Number.isFinite(endsAt) && endsAt > now;
  });
}

/**
 * `GET /catalog/flash-sales` — running automatic flash sales, soonest-ending first.
 * Call `mutate()` when a countdown expires to drop the finished sale.
 */
export function useFlashSales() {
  const { data, error, isLoading, mutate } = useSWR<CatalogFlashSaleDTO[], ApiError, string>(
    FLASH_SALES_PATH,
    async (path: string) => stillRunning(await api.get<CatalogFlashSaleDTO[]>(path), Date.now()),
    { revalidateOnFocus: true, dedupingInterval: 15_000 }
  );

  return {
    sales: data ?? [],
    isLoading,
    error,
    mutate,
  };
}
