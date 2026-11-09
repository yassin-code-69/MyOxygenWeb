"use client";

import { useCallback, useEffect, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { api, isApiError, type ApiError } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import { computeCartTotals, toCartItemInputs, useCartStore } from "../../lib/cart-store";
import type { CartItem, CartTotals } from "../../types/cart";
import type { CartItemInput, CouponPreviewDTO, CouponPreviewPayload } from "../../types/order";

const PREVIEW_PATH = "/orders/validate-coupon";
/** Wait this long after the last cart change before re-validating the coupon. */
const REVALIDATE_DEBOUNCE_MS = 450;

type PreviewKey = readonly [typeof PREVIEW_PATH, string, string, string];

/** Stable `productId:qty,…` signature of the cart lines (order-independent). */
export function cartSignature(items: readonly CartItem[]): string {
  return items
    .map((item) => `${item.id}:${item.quantity}`)
    .sort()
    .join(",");
}

function parseSignature(signature: string): CartItemInput[] {
  if (signature === "") {
    return [];
  }
  return signature.split(",").map((entry) => {
    const [productId = "", quantity = "0"] = entry.split(":");
    return { productId, quantity: Number.parseInt(quantity, 10) };
  });
}

function previewKey(code: string, signature: string, viewer: string): PreviewKey {
  return [PREVIEW_PATH, code, signature, viewer] as const;
}

function fetchPreview([path, code, signature]: PreviewKey): Promise<CouponPreviewDTO> {
  const body: CouponPreviewPayload = { code, items: parseSignature(signature) };
  return api.post<CouponPreviewDTO>(path, body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Product ids from a 409 CONFLICT `{ unavailableProductIds }`, if that is what `error` is. */
export function unavailableProductIdsOf(error: unknown): string[] {
  if (!isApiError(error) || error.status !== 409 || error.code !== "CONFLICT" || !isRecord(error.details)) {
    return [];
  }
  const ids = error.details.unavailableProductIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/**
 * Removes products the API reported as no longer sold and tells the customer
 * which ones. Safe to call from several components for the same error.
 */
export function dropUnavailableProducts(productIds: readonly string[]): string[] {
  const { items, removeItems } = useCartStore.getState();
  const wanted = new Set(productIds.map((id) => id.toLowerCase()));
  const removed = items.filter((item) => wanted.has(item.id.toLowerCase()));
  if (removed.length === 0) {
    return [];
  }
  removeItems(removed.map((item) => item.id));
  const titles = removed.map((item) => item.title);
  notifications.show({
    id: `cart-unavailable-${removed.map((item) => item.id).join("-")}`,
    color: "warning",
    title: removed.length === 1 ? "An item was removed from your cart" : "Some items were removed from your cart",
    message: `${titles.join(", ")} ${removed.length === 1 ? "is" : "are"} no longer available.`,
  });
  return titles;
}

export interface UseCouponPreviewOptions {
  /** Pause network re-validation (e.g. while the cart drawer is closed). */
  enabled?: boolean;
}

export interface UseCouponPreviewResult {
  couponCode: string | null;
  /** Valid preview computed for exactly the current cart, else `null`. */
  preview: CouponPreviewDTO | null;
  /** A coupon is applied but its discount for the current cart is not confirmed yet. */
  isRecalculating: boolean;
  /** A request is in flight (the shown preview may be refreshed in a moment). */
  isChecking: boolean;
  /** Re-validation failed for a non-coupon reason (network, rate limit…). */
  error: ApiError | null;
  /** Totals to display: the server preview when fresh, otherwise local prices without discount. */
  totals: CartTotals;
  /** Validates `code` against the current cart; applies it when valid. Throws `ApiError` on failure. */
  apply: (code: string) => Promise<CouponPreviewDTO>;
  remove: () => void;
  retry: () => void;
}

/**
 * Live coupon preview for the cart (`POST /orders/validate-coupon`).
 *
 * - Re-validates automatically (debounced) whenever cart lines or the signed-in
 *   user change; a discount is only shown for the exact cart it was computed for.
 * - Drops a coupon that stops being valid and explains why.
 * - Removes products the API reports as unavailable.
 */
export function useCouponPreview({ enabled = true }: UseCouponPreviewOptions = {}): UseCouponPreviewResult {
  const items = useCartStore((state) => state.items);
  const couponCode = useCartStore((state) => state.couponCode);
  const setCouponCode = useCartStore((state) => state.setCouponCode);
  const viewer = useAuthStore((state) => state.user?.id ?? "guest");
  const { mutate: globalMutate } = useSWRConfig();

  const signature = useMemo(() => cartSignature(items), [items]);
  const [debouncedSignature] = useDebouncedValue(signature, REVALIDATE_DEBOUNCE_MS);
  const isDebouncing = signature !== debouncedSignature;

  const key: PreviewKey | null =
    enabled && couponCode && debouncedSignature !== "" ? previewKey(couponCode, debouncedSignature, viewer) : null;

  const { data, error, isValidating, mutate } = useSWR<CouponPreviewDTO, ApiError, PreviewKey | null>(key, fetchPreview, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 10_000,
    keepPreviousData: false,
  });

  // A coupon that is no longer usable for this cart is dropped with its reason.
  useEffect(() => {
    if (!data || data.valid) {
      return;
    }
    if (useCartStore.getState().couponCode !== data.code) {
      return;
    }
    setCouponCode(null);
    notifications.show({
      id: `coupon-dropped-${data.code}`,
      color: "warning",
      title: `Coupon ${data.code} removed`,
      message: data.reason ?? "This coupon no longer applies to your cart.",
    });
  }, [data, setCouponCode]);

  // Products that stopped being sold are removed from the cart.
  useEffect(() => {
    const ids = unavailableProductIdsOf(error);
    if (ids.length > 0) {
      dropUnavailableProducts(ids);
    }
  }, [error]);

  const fresh = Boolean(couponCode) && !isDebouncing && data !== undefined && data.code === couponCode;
  const preview = fresh && data?.valid ? data : null;
  const hasLines = items.length > 0;
  const isRecalculating = Boolean(couponCode) && hasLines && enabled && !preview && !error && !(fresh && !data?.valid);

  const totals = useMemo(() => computeCartTotals(items, preview), [items, preview]);

  const apply = useCallback(
    async (code: string) => {
      const normalized = code.trim().toUpperCase();
      const lines = useCartStore.getState().items;
      const result = await api.post<CouponPreviewDTO>(PREVIEW_PATH, {
        code: normalized,
        items: toCartItemInputs(lines),
      } satisfies CouponPreviewPayload);
      if (result.valid) {
        await globalMutate(previewKey(result.code, cartSignature(lines), viewer), result, { revalidate: false });
        setCouponCode(result.code);
      }
      return result;
    },
    [globalMutate, setCouponCode, viewer]
  );

  const remove = useCallback(() => setCouponCode(null), [setCouponCode]);
  const retry = useCallback(() => {
    void mutate();
  }, [mutate]);

  return {
    couponCode,
    preview,
    isRecalculating,
    isChecking: Boolean(couponCode) && (isRecalculating || isValidating),
    error: error && unavailableProductIdsOf(error).length === 0 ? error : null,
    totals,
    apply,
    remove,
    retry,
  };
}
