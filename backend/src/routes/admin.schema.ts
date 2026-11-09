/**
 * Zod schemas for the admin order, analytics and invoice endpoints.
 */
import { z } from "zod";
import { paymentMethodEnum, paymentStatusEnum } from "../db/schema/enums";
import { daysBetween } from "../lib/dates";
import { paginationQuery } from "../lib/validation";
import { MAX_DAILY_RANGE_DAYS } from "../services/admin-telemetry.service";
import { ORDER_STATUSES } from "../services/order-state-machine";

export const orderStatusEnumValues = ORDER_STATUSES;

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** "ALL" (sent by older admin UIs) means "no filter". */
const allToUndefined = (value: unknown): unknown => {
  const normalized = emptyToUndefined(value);
  return typeof normalized === "string" && normalized.toUpperCase() === "ALL" ? undefined : normalized;
};

/** Calendar date YYYY-MM-DD (interpreted in APP_TIMEZONE). */
export const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date");

const searchSchema = z.preprocess(emptyToUndefined, z.string().trim().max(100).optional());

function refineRange<T extends { from?: string; to?: string }>(value: T, ctx: z.RefinementCtx): void {
  if (value.from && value.to && value.from > value.to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "from must be on or before to" });
  }
}

export const adminOrdersQuerySchema = paginationQuery
  .extend({
    status: z.preprocess(allToUndefined, z.enum(ORDER_STATUSES).optional()),
    q: searchSchema,
    from: z.preprocess(emptyToUndefined, businessDateSchema.optional()),
    to: z.preprocess(emptyToUndefined, businessDateSchema.optional()),
  })
  .superRefine(refineRange);

export const updateOrderStatusSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    note: z.preprocess(emptyToUndefined, z.string().trim().max(500, "Note must not exceed 500 characters").optional()),
    courierCancellationConfirmed: z.boolean().optional(),
    courierProvider: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(64).optional()),
    trackingId: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(128).optional()),
  })
  .superRefine((value, ctx) => {
    const hasShipment = value.courierProvider !== undefined || value.trackingId !== undefined;
    if (hasShipment && value.status !== "SHIPPED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trackingId"],
        message: "courierProvider and trackingId can only be set when marking an order SHIPPED",
      });
    }
    if (hasShipment && (value.courierProvider === undefined || value.trackingId === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [value.courierProvider === undefined ? "courierProvider" : "trackingId"],
        message: "courierProvider and trackingId must be provided together",
      });
    }
  });

/** Unknown keys (e.g. a client-chosen courierProvider) are stripped: the courier is env.COURIER_PROVIDER. */
export const dispatchCourierSchema = z.object({
  weightKg: z.number().positive("weightKg must be positive").max(50, "weightKg must not exceed 50").optional(),
  note: z.preprocess(emptyToUndefined, z.string().trim().max(250, "Note must not exceed 250 characters").optional()),
});

export const analyticsQuerySchema = z
  .object({
    from: z.preprocess(emptyToUndefined, businessDateSchema.optional()),
    to: z.preprocess(emptyToUndefined, businessDateSchema.optional()),
  })
  .superRefine((value, ctx) => {
    refineRange(value, ctx);
    if (value.from && value.to && daysBetween(value.from, value.to) + 1 > MAX_DAILY_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: `The range must not exceed ${MAX_DAILY_RANGE_DAYS} days`,
      });
    }
  });

export const invoiceListQuerySchema = paginationQuery
  .extend({
    q: searchSchema,
    paymentStatus: z.preprocess(allToUndefined, z.enum(paymentStatusEnum.enumValues).optional()),
    paymentMethod: z.preprocess(
      (value) => {
        const normalized = allToUndefined(value);
        return normalized === "CASH_ON_DELIVERY" ? "COD" : normalized;
      },
      z.enum(paymentMethodEnum.enumValues).optional(),
    ),
    from: z.preprocess(emptyToUndefined, businessDateSchema.optional()),
    to: z.preprocess(emptyToUndefined, businessDateSchema.optional()),
  })
  .superRefine(refineRange);

/** Invoice UUID or invoice number (INV-...). */
export const invoiceRefParam = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, "Invalid invoice reference"),
});

export type UpdateOrderStatusPayload = z.infer<typeof updateOrderStatusSchema>;
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;
export type DispatchCourierPayload = z.infer<typeof dispatchCourierSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type InvoiceListQueryInput = z.infer<typeof invoiceListQuerySchema>;
