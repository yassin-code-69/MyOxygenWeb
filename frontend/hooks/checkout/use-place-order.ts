"use client";

import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { api, getErrorMessage, isApiError } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import type { CheckoutPayload, CouponReasonCode, OrderDetailDTO, ShippingAddress } from "../../types/order";
import { orderDetailKey } from "../orders/keys";
import { unavailableProductIdsOf } from "./use-coupon-preview";

export type ShippingField = keyof ShippingAddress;

/** What went wrong with `POST /orders/checkout`, in terms the UI can act on. */
export type CheckoutProblem =
  | { kind: "insufficient-stock"; productId: string; requested: number; available: number; message: string }
  | { kind: "unavailable"; productIds: string[]; message: string }
  | { kind: "invalid-coupon"; code: string | null; reasonCode: CouponReasonCode | null; message: string }
  | { kind: "validation"; fieldErrors: Partial<Record<ShippingField, string>>; messages: string[]; message: string }
  | { kind: "unauthorized"; message: string }
  | { kind: "other"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The API flattens nested Zod errors, so every shipping problem arrives under
 * `fieldErrors.shippingAddress`. The messages are fixed strings in
 * `backend/src/routes/orders.schema.ts`; map them back to form fields.
 */
const SHIPPING_MESSAGE_FIELDS: readonly [RegExp, ShippingField][] = [
  [/^full name/i, "fullName"],
  [/phone|mobile/i, "phone"],
  [/^address line 2/i, "addressLine2"],
  [/^address/i, "addressLine1"],
  [/^city/i, "city"],
  [/^district/i, "district"],
  [/postal|postcode/i, "postalCode"],
];

function shippingFieldFor(message: string): ShippingField | null {
  const match = SHIPPING_MESSAGE_FIELDS.find(([pattern]) => pattern.test(message));
  return match ? match[1] : null;
}

/** Turns any thrown checkout error into a `CheckoutProblem`. */
export function parseCheckoutError(error: unknown): CheckoutProblem {
  const message = getErrorMessage(error, "We couldn't place your order. Please try again.");
  if (!isApiError(error)) {
    return { kind: "other", message };
  }
  if (error.status === 401) {
    return { kind: "unauthorized", message: "Your session has ended. Please sign in again to place your order." };
  }
  if (error.code === "INSUFFICIENT_STOCK" && isRecord(error.details)) {
    const { productId, requested, available } = error.details;
    if (typeof productId === "string") {
      return {
        kind: "insufficient-stock",
        productId,
        requested: typeof requested === "number" ? requested : 0,
        available: typeof available === "number" ? Math.max(0, available) : 0,
        message,
      };
    }
  }
  const unavailable = unavailableProductIdsOf(error);
  if (unavailable.length > 0) {
    return { kind: "unavailable", productIds: unavailable, message };
  }
  if (error.code === "INVALID_COUPON") {
    const details = isRecord(error.details) ? error.details : {};
    return {
      kind: "invalid-coupon",
      code: typeof details.code === "string" ? details.code : null,
      reasonCode: typeof details.reasonCode === "string" ? (details.reasonCode as CouponReasonCode) : null,
      message,
    };
  }
  if (error.code === "VALIDATION_ERROR") {
    const fieldErrors: Partial<Record<ShippingField, string>> = {};
    const messages: string[] = [];
    for (const [field, fieldMessages] of Object.entries(error.fieldErrors)) {
      for (const fieldMessage of fieldMessages) {
        messages.push(fieldMessage);
        const shippingField = field === "shippingAddress" ? shippingFieldFor(fieldMessage) : null;
        if (shippingField && !fieldErrors[shippingField]) {
          fieldErrors[shippingField] = fieldMessage;
        }
      }
    }
    return { kind: "validation", fieldErrors, messages, message };
  }
  return { kind: "other", message };
}

/** `POST /orders/checkout`; primes the order-detail cache and refreshes "My orders". */
export function usePlaceOrder() {
  const { mutate } = useSWRConfig();
  const viewer = useAuthStore((state) => state.user?.id ?? "guest");

  const placeOrder = useCallback(
    async (payload: CheckoutPayload): Promise<OrderDetailDTO> => {
      const order = await api.post<OrderDetailDTO>("/orders/checkout", payload);
      await mutate(orderDetailKey(order.orderNumber, viewer), order, { revalidate: false });
      void mutate((key) => Array.isArray(key) && key[0] === "/orders/my-orders", undefined, { revalidate: true });
      return order;
    },
    [mutate, viewer]
  );

  return { placeOrder };
}
