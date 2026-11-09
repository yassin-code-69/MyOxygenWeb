/**
 * Zod schemas for the admin order, analytics, report, expense, payment,
 * search and invoice endpoints.
 */
import { z } from "zod";
import { paymentMethodEnum, paymentStatusEnum } from "../db/schema/enums";
import { daysBetween, todayInBusinessTz } from "../lib/dates";
import { paginationQuery } from "../lib/validation";
import { MAX_DAILY_RANGE_DAYS } from "../services/admin-telemetry.service";
import { EXPENSE_CATEGORIES } from "../services/expense.service";
import { ORDER_STATUSES } from "../services/order-state-machine";
import { DEFAULT_ACTIVITY_LIMIT, MAX_ACTIVITY_LIMIT } from "../services/reports/activity.service";
import { PROFIT_PRODUCT_SORTS } from "../services/reports/profit-report.service";
import { PRODUCT_REPORT_SORTS } from "../services/reports/sales-report.service";
import { SEARCH_MIN_LENGTH } from "../services/search.service";
import { moneyInputSchema } from "./catalog.schema";

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

/** from <= to and at most MAX_DAILY_RANGE_DAYS (366) inclusive days when both are given. */
function refineReportRange<T extends { from?: string; to?: string }>(value: T, ctx: z.RefinementCtx): void {
  refineRange(value, ctx);
  if (value.from && value.to && value.from <= value.to && daysBetween(value.from, value.to) + 1 > MAX_DAILY_RANGE_DAYS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to"],
      message: `The range must not exceed ${MAX_DAILY_RANGE_DAYS} days`,
    });
  }
}

const optionalBusinessDate = z.preprocess(emptyToUndefined, businessDateSchema.optional());
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid("must be a valid UUID").optional());

const paymentStatusFilter = z.preprocess(allToUndefined, z.enum(paymentStatusEnum.enumValues).optional());
/** Payment method filter; "CASH_ON_DELIVERY" is accepted as an alias of COD. */
const paymentMethodFilter = z.preprocess(
  (value) => {
    const normalized = allToUndefined(value);
    return typeof normalized === "string" && normalized.toUpperCase() === "CASH_ON_DELIVERY" ? "COD" : normalized;
  },
  z.enum(paymentMethodEnum.enumValues).optional(),
);

/** Timestamp that the `from`/`to` range of GET /admin/orders filters on. */
export const ORDER_DATE_FIELDS = ["createdAt", "shippedAt", "deliveredAt"] as const;

export const adminOrdersQuerySchema = paginationQuery
  .extend({
    status: z.preprocess(allToUndefined, z.enum(ORDER_STATUSES).optional()),
    paymentStatus: paymentStatusFilter,
    paymentMethod: paymentMethodFilter,
    q: searchSchema,
    from: optionalBusinessDate,
    to: optionalBusinessDate,
    // createdAt (default) | shippedAt | deliveredAt — e.g. "delivered in range" lists.
    dateField: z.preprocess(emptyToUndefined, z.enum(ORDER_DATE_FIELDS).default("createdAt")),
    // Courier provider (case-insensitive); "unknown" = orders without a courier.
    courier: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(64).optional()),
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

/** `?from&to` inclusive business dates (defaults are applied by the service). */
export const analyticsQuerySchema = z
  .object({
    from: optionalBusinessDate,
    to: optionalBusinessDate,
  })
  .superRefine(refineReportRange);

/** Same rules as the dashboard range (reports default to the last 30 days in the service). */
export const reportRangeQuerySchema = analyticsQuerySchema;

export const activityQuerySchema = z.object({
  limit: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(MAX_ACTIVITY_LIMIT).default(DEFAULT_ACTIVITY_LIMIT),
  ),
});

export const productReportQuerySchema = paginationQuery
  .extend({
    from: optionalBusinessDate,
    to: optionalBusinessDate,
    q: searchSchema,
    categoryId: optionalUuid,
    sort: z.preprocess(emptyToUndefined, z.enum(PRODUCT_REPORT_SORTS).default("revenue_desc")),
  })
  .superRefine(refineReportRange);

export const customerReportQuerySchema = paginationQuery
  .extend({
    from: optionalBusinessDate,
    to: optionalBusinessDate,
  })
  .superRefine(refineReportRange);

export const profitProductsQuerySchema = paginationQuery
  .extend({
    from: optionalBusinessDate,
    to: optionalBusinessDate,
    q: searchSchema,
    categoryId: optionalUuid,
    sort: z.preprocess(emptyToUndefined, z.enum(PROFIT_PRODUCT_SORTS).default("margin_desc")),
  })
  .superRefine(refineReportRange);

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

/** numeric(12,2) upper bound. */
export const MAX_EXPENSE_AMOUNT = 9_999_999_999.99;

const expenseCategoryField = z.enum(EXPENSE_CATEGORIES, {
  errorMap: () => ({ message: `category must be one of ${EXPENSE_CATEGORIES.join(", ")}` }),
});
const expenseAmountField = moneyInputSchema(MAX_EXPENSE_AMOUNT).refine((value) => value > 0, "must be greater than 0");
const incurredOnField = businessDateSchema.refine(
  (value) => value <= todayInBusinessTz(),
  "incurredOn must not be in the future",
);
/** Optional free text: trimmed, "" or null → null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `must not exceed ${max} characters`)
    .nullable()
    .transform((value) => (value === null || value === "" ? null : value));

export const expenseListQuerySchema = paginationQuery
  .extend({
    from: optionalBusinessDate,
    to: optionalBusinessDate,
    category: z.preprocess(allToUndefined, expenseCategoryField.optional()),
  })
  .superRefine(refineRange);

export const createExpenseSchema = z
  .object({
    category: expenseCategoryField,
    amount: expenseAmountField,
    incurredOn: incurredOnField,
    vendor: optionalText(120).optional(),
    note: optionalText(500).optional(),
  })
  .strict();

export const updateExpenseSchema = z
  .object({
    category: expenseCategoryField.optional(),
    amount: expenseAmountField.optional(),
    incurredOn: incurredOnField.optional(),
    vendor: optionalText(120).optional(),
    note: optionalText(500).optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

// ---------------------------------------------------------------------------
// Payments & search
// ---------------------------------------------------------------------------

export const paymentSummaryQuerySchema = reportRangeQuerySchema;

export const adminSearchQuerySchema = z.object({
  q: z
    .string({ required_error: "q is required" })
    .trim()
    .min(SEARCH_MIN_LENGTH, `q must be at least ${SEARCH_MIN_LENGTH} characters`)
    .max(100, "q must not exceed 100 characters"),
});

export const invoiceListQuerySchema = paginationQuery
  .extend({
    q: searchSchema,
    paymentStatus: paymentStatusFilter,
    paymentMethod: paymentMethodFilter,
    from: optionalBusinessDate,
    to: optionalBusinessDate,
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
export type ProductReportQueryInput = z.infer<typeof productReportQuerySchema>;
export type CustomerReportQueryInput = z.infer<typeof customerReportQuerySchema>;
export type ProfitProductsQueryInput = z.infer<typeof profitProductsQuerySchema>;
export type ExpenseListQueryInput = z.infer<typeof expenseListQuerySchema>;
export type CreateExpensePayload = z.infer<typeof createExpenseSchema>;
export type UpdateExpensePayload = z.infer<typeof updateExpenseSchema>;
