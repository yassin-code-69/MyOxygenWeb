import { z } from "zod";

export const bangladeshiPhoneRegex = /^(\+880|880|0)1[3-9]\d{8}$/;
export const bangladeshiPostcodeRegex = /^\d{4}$/;

export const shippingAddressSchema = z.object({
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must not exceed 100 characters"),
  phone: z
    .string()
    .regex(bangladeshiPhoneRegex, "Enter a valid Bangladeshi phone number"),
  addressLine1: z
    .string()
    .min(5, "Address must be at least 5 characters")
    .max(255, "Address must not exceed 255 characters"),
  city: z
    .string()
    .min(2, "City must be at least 2 characters")
    .max(100, "City must not exceed 100 characters"),
  district: z
    .string()
    .min(2, "District must be at least 2 characters")
    .max(100, "District must not exceed 100 characters"),
  postalCode: z
    .string()
    .regex(bangladeshiPostcodeRegex, "4-digit Bangladesh postcode"),
});

export const cartItemInputSchema = z.object({
  productId: z.string().uuid("productId must be a valid UUID"),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .positive("Quantity must be greater than zero"),
});

export const validateCouponSchema = z.object({
  code: z.string().min(2, "Coupon code must be at least 2 characters"),
  items: z.array(cartItemInputSchema).optional().default([]),
});

export const checkoutSchema = z.object({
  shippingAddress: shippingAddressSchema,
  items: z.array(cartItemInputSchema).min(1, "Cart must contain at least one item"),
  paymentMethod: z.enum(["CASH_ON_DELIVERY", "COD", "ONLINE_GATEWAY"]),
  couponCode: z.string().optional(),
});

export type ShippingAddress = z.infer<typeof shippingAddressSchema>;
export type CartItemInput = z.infer<typeof cartItemInputSchema>;
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
export type CheckoutPayload = z.infer<typeof checkoutSchema>;
