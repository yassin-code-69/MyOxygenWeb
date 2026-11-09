/**
 * Shipping address form schema — mirrors `shippingAddressSchema` in
 * `backend/src/routes/orders.schema.ts` so the customer sees the same rules
 * before the request is sent.
 */
import { z } from "zod";
import { isBangladeshDistrict, resolveBangladeshDistrict } from "../../lib/bd-districts";
import { isBangladeshMobile, normalizeBangladeshMobile } from "../../lib/phone";
import type { ShippingAddress } from "../../types/order";

export const shippingSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter the recipient's full name (at least 2 characters).")
    .max(100, "Full name must not exceed 100 characters."),
  phone: z
    .string()
    .trim()
    .min(1, "Enter a mobile number for the courier.")
    .refine(isBangladeshMobile, "Enter a valid Bangladeshi mobile number, e.g. 01712345678."),
  addressLine1: z
    .string()
    .trim()
    .min(5, "Enter the house, road and area (at least 5 characters).")
    .max(255, "Address must not exceed 255 characters."),
  addressLine2: z.string().trim().max(255, "Address line 2 must not exceed 255 characters."),
  city: z
    .string()
    .trim()
    .min(2, "Enter your city or area (at least 2 characters).")
    .max(100, "City must not exceed 100 characters."),
  district: z
    .string()
    .trim()
    .min(1, "Choose your district.")
    .refine(isBangladeshDistrict, "Choose a district from the list."),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Enter your 4-digit postcode, e.g. 1205."),
});

export type ShippingFormValues = z.infer<typeof shippingSchema>;

export const EMPTY_SHIPPING: ShippingFormValues = {
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  district: "",
  postalCode: "",
};

/** Field order, used to focus the first invalid input. */
export const SHIPPING_FIELDS = [
  "fullName",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "district",
  "postalCode",
] as const satisfies readonly (keyof ShippingFormValues)[];

export function shippingInputId(field: keyof ShippingFormValues): string {
  return `checkout-shipping-${field}`;
}

/** Canonical API payload: trimmed, phone as `01XXXXXXXXX`, empty line 2 omitted. */
export function toShippingAddress(values: ShippingFormValues): ShippingAddress {
  const addressLine2 = values.addressLine2.trim();
  return {
    fullName: values.fullName.trim(),
    phone: normalizeBangladeshMobile(values.phone) ?? values.phone.trim(),
    addressLine1: values.addressLine1.trim(),
    ...(addressLine2 ? { addressLine2 } : {}),
    city: values.city.trim(),
    district: resolveBangladeshDistrict(values.district) ?? values.district.trim(),
    postalCode: values.postalCode.trim(),
  };
}

/** Form values from a stored address (e.g. the customer's previous order). */
export function fromShippingAddress(address: ShippingAddress): ShippingFormValues {
  return {
    fullName: address.fullName ?? "",
    phone: normalizeBangladeshMobile(address.phone) ?? address.phone ?? "",
    addressLine1: address.addressLine1 ?? "",
    addressLine2: address.addressLine2 ?? "",
    city: address.city ?? "",
    district: resolveBangladeshDistrict(address.district) ?? "",
    postalCode: address.postalCode ?? "",
  };
}
