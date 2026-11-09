/**
 * Zod schemas for /orders (customer) endpoints. Output types are exactly what
 * the services consume; the shipping address output is the canonical
 * `ShippingAddress` stored in orders.shipping_address.
 */
import { z } from "zod";
import { paginationQuery } from "../lib/validation";
import { MAX_LINE_QUANTITY } from "../services/order-pricing";
import { BANGLADESH_MOBILE_PATTERN, normalizeBangladeshMobile } from "../services/phone";
import type { ShippingAddress } from "../types";

export type { ShippingAddress };

export { BANGLADESH_MOBILE_PATTERN };
export const BANGLADESH_POSTCODE_PATTERN = /^\d{4}$/;
export const MAX_CART_LINES = 100;

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** Bangladeshi mobile number, normalised to 01XXXXXXXXX. */
export const bangladeshPhoneSchema = z
  .string({ required_error: "Phone number is required" })
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeBangladeshMobile(value);
    if (normalized === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid Bangladeshi mobile number (e.g. 01712345678)",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const shippingAddressSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must not exceed 100 characters"),
  phone: bangladeshPhoneSchema,
  addressLine1: z
    .string()
    .trim()
    .min(5, "Address must be at least 5 characters")
    .max(255, "Address must not exceed 255 characters"),
  addressLine2: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(255, "Address line 2 must not exceed 255 characters").optional(),
  ),
  city: z.string().trim().min(2, "City must be at least 2 characters").max(100, "City must not exceed 100 characters"),
  district: z
    .string()
    .trim()
    .min(2, "District must be at least 2 characters")
    .max(100, "District must not exceed 100 characters"),
  postalCode: z.string().trim().regex(BANGLADESH_POSTCODE_PATTERN, "Postal code must be a 4-digit Bangladesh postcode"),
}) satisfies z.ZodType<ShippingAddress, z.ZodTypeDef, unknown>;

export const cartItemSchema = z.object({
  productId: z
    .string()
    .uuid("productId must be a valid UUID")
    .transform((value) => value.toLowerCase()),
  quantity: z
    .number({ invalid_type_error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(MAX_LINE_QUANTITY, `Quantity must not exceed ${MAX_LINE_QUANTITY}`),
});

const cartItemsSchema = z
  .array(cartItemSchema)
  .min(1, "Cart must contain at least one item")
  .max(MAX_CART_LINES, `Cart must not contain more than ${MAX_CART_LINES} lines`);

const couponCodeSchema = z.string().trim().min(1, "Coupon code is required").max(64, "Coupon code is too long");

export const validateCouponSchema = z.object({
  code: couponCodeSchema,
  items: cartItemsSchema,
});

/**
 * "COD" | "ONLINE_GATEWAY". "CASH_ON_DELIVERY" is accepted as a deprecated
 * alias of "COD" for older clients.
 */
export const paymentMethodSchema = z
  .enum(["COD", "ONLINE_GATEWAY", "CASH_ON_DELIVERY"], {
    errorMap: () => ({ message: "paymentMethod must be COD or ONLINE_GATEWAY" }),
  })
  .transform((value): "COD" | "ONLINE_GATEWAY" => (value === "CASH_ON_DELIVERY" ? "COD" : value));

export const checkoutSchema = z.object({
  shippingAddress: shippingAddressSchema,
  items: cartItemsSchema,
  paymentMethod: paymentMethodSchema,
  couponCode: z.preprocess(emptyToUndefined, couponCodeSchema.optional()),
});

export const myOrdersQuerySchema = paginationQuery;

/** `:idOrNumber` — an order UUID or an order number such as ORD-20261109-7KQ2M9XA. */
export const orderRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9-]+$/, "Invalid order reference");

export const orderRefParam = z.object({ idOrNumber: orderRefSchema });
export const orderIdParam = z.object({ id: orderRefSchema });
export const orderNumberParam = z.object({ orderNumber: orderRefSchema });

export const cancelOrderSchema = z.object({
  reason: z.preprocess(emptyToUndefined, z.string().trim().max(300, "Reason must not exceed 300 characters").optional()),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
