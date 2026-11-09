"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { notifications } from "@mantine/notifications";
import { api, isApiError, type ApiError } from "../../lib/api-client";
import { maxQuantityFor, useCartStore } from "../../lib/cart-store";
import { formatBDT } from "../../lib/format";

/** The catalog fields checkout needs (subset of `CatalogProductDTO`). */
interface ProductSnapshot {
  id: string;
  slug: string;
  title: string;
  images: string[];
  basePrice: number;
  effectivePrice: number;
  totalStock: number;
  requiresBatchTracking: boolean;
  earliestExpiry: string | null;
}

interface RefreshResult {
  id: string;
  product: ProductSnapshot | null;
}

type RefreshKey = readonly ["checkout:cart-prices", string];

async function fetchSnapshots([, joinedIds]: RefreshKey): Promise<RefreshResult[]> {
  return Promise.all(
    joinedIds.split(",").map(async (id) => {
      try {
        // Anonymous request → served from the API's catalog cache.
        const product = await api.get<ProductSnapshot>(`/catalog/products/${encodeURIComponent(id)}`, undefined, {
          auth: false,
        });
        return { id, product };
      } catch (error) {
        if (isApiError(error) && error.status === 404) {
          return { id, product: null };
        }
        throw error;
      }
    })
  );
}

/**
 * Re-prices the cart from the live catalog when checkout opens, so the totals
 * (and the "Place order (৳…)" amount) match what the API will charge: effective
 * price, stock limits and FEFO expiry are refreshed; products no longer sold
 * are removed. The customer is told about every change.
 */
export function useCartPriceRefresh(enabled: boolean) {
  const joinedIds = useCartStore((state) =>
    state.items
      .map((item) => item.id)
      .sort()
      .join(",")
  );
  const key: RefreshKey | null = enabled && joinedIds !== "" ? ["checkout:cart-prices", joinedIds] : null;

  const { data, error } = useSWR<RefreshResult[], ApiError, RefreshKey | null>(key, fetchSnapshots, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
    dedupingInterval: 60_000,
  });

  useEffect(() => {
    if (!data) {
      return;
    }
    const { items, syncItem, removeItems } = useCartStore.getState();
    const changes: string[] = [];
    const removed: string[] = [];

    for (const { id, product } of data) {
      const item = items.find((line) => line.id === id);
      if (!item) {
        continue;
      }
      if (!product || product.totalStock <= 0) {
        removed.push(item.title);
        removeItems([id]);
        continue;
      }
      if (product.effectivePrice !== item.unitPrice) {
        changes.push(`${product.title}: now ${formatBDT(product.effectivePrice)} (was ${formatBDT(item.unitPrice)})`);
      }
      const nextMax = maxQuantityFor({ maxStock: product.totalStock });
      if (item.quantity > nextMax) {
        changes.push(`${product.title}: only ${nextMax} available, quantity updated`);
      }
      syncItem(id, {
        title: product.title,
        slug: product.slug,
        image: product.images[0] ?? item.image,
        unitPrice: product.effectivePrice,
        originalPrice: product.basePrice > product.effectivePrice ? product.basePrice : undefined,
        maxStock: product.totalStock,
        requiresBatchTracking: product.requiresBatchTracking,
        earliestExpiry: product.earliestExpiry,
      });
    }

    if (removed.length > 0) {
      notifications.show({
        id: `checkout-removed-${removed.join("-")}`,
        color: "warning",
        title: "Removed from your cart",
        message: `${removed.join(", ")} ${removed.length === 1 ? "is" : "are"} no longer available.`,
      });
    }
    if (changes.length > 0) {
      notifications.show({
        id: `checkout-repriced-${changes.length}-${data.length}`,
        color: "info",
        title: "Your cart was updated",
        message: changes.join(" · "),
        autoClose: 8000,
      });
    }
  }, [data]);

  return {
    /** First refresh still in flight (totals may change in a moment). */
    isRefreshing: key !== null && data === undefined && error === undefined,
    error: error ?? null,
  };
}
