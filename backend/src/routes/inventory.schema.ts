/**
 * Zod schemas for /admin/inventory/* and /admin/batches.
 */
import { z } from "zod";
import { isIsoCalendarDate, todayInBusinessTz } from "../lib/dates";
import { paginationQuery } from "../lib/validation";
import { BATCH_HEALTH_STATUSES } from "../services/batch-inspector.service";
import { ADJUSTMENT_REASONS, validateBatchDates } from "../services/inventory.service";

// ---------------------------------------------------------------------------
// Shared query-string primitives
// ---------------------------------------------------------------------------

/** Query-string boolean: "true" | "false" | "1" | "0" (anything else is a 422). */
export const booleanQueryParam = z
  .enum(["true", "false", "1", "0"], {
    errorMap: () => ({ message: 'must be "true" or "false"' }),
  })
  .transform((value) => value === "true" || value === "1");

const searchTerm = z.string().trim().min(1, "must not be empty").max(100);

const isoDateTime = z.string().datetime({ offset: true });

/** `YYYY-MM-DD` (business-calendar day) or an ISO-8601 datetime with offset. */
const dateOrDateTime = z
  .string()
  .trim()
  .refine((value) => isIsoCalendarDate(value) || isoDateTime.safeParse(value).success, {
    message: "must be a YYYY-MM-DD date or an ISO-8601 datetime",
  });

export const STOCK_HISTORY_REASONS = [
  "IMPORT",
  "PURCHASE",
  "RETURN",
  "MANUAL_ADJUSTMENT",
  "EXPIRED_SCRAP",
] as const;

// ---------------------------------------------------------------------------
// POST /admin/inventory/batches
// ---------------------------------------------------------------------------

export const importBatchSchema = z
  .object({
    productId: z.string().uuid("productId must be a valid UUID"),
    batchNumber: z
      .string()
      .trim()
      .min(2, "batchNumber must be at least 2 characters")
      .max(64, "batchNumber must be at most 64 characters")
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "batchNumber may contain letters, digits, '.', '_', '/' and '-'"),
    manufactureDate: z.string().trim().nullable().optional(),
    expiryDate: z.string().trim(),
    initialQuantity: z
      .number({ invalid_type_error: "initialQuantity must be a number" })
      .int("initialQuantity must be a whole number")
      .positive("initialQuantity must be greater than zero")
      .max(1_000_000, "initialQuantity is too large"),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const errors = validateBatchDates(data.manufactureDate ?? null, data.expiryDate, todayInBusinessTz());
    if (!errors) return;
    for (const [field, messages] of Object.entries(errors)) {
      for (const message of messages) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
      }
    }
  });

// ---------------------------------------------------------------------------
// POST /admin/inventory/adjust
// ---------------------------------------------------------------------------

export const stockAdjustmentSchema = z
  .object({
    productId: z.string().uuid("productId must be a valid UUID"),
    batchId: z.string().uuid("batchId must be a valid UUID"),
    delta: z
      .number({ invalid_type_error: "delta must be a number" })
      .int("delta must be a whole number")
      .min(-1_000_000)
      .max(1_000_000)
      .refine((value) => value !== 0, "delta cannot be zero"),
    reason: z
      .enum(ADJUSTMENT_REASONS, {
        errorMap: () => ({ message: "reason must be MANUAL_ADJUSTMENT or EXPIRED_SCRAP" }),
      })
      .default("MANUAL_ADJUSTMENT"),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.reason === "EXPIRED_SCRAP" && data.delta > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["delta"],
        message: "EXPIRED_SCRAP adjustments must remove stock (negative delta)",
      });
    }
  });

// ---------------------------------------------------------------------------
// GET /admin/inventory/ledger
// ---------------------------------------------------------------------------

function boundInstant(value: string, end: boolean): number {
  if (isIsoCalendarDate(value)) {
    const start = Date.parse(`${value}T00:00:00Z`);
    return end ? start + 24 * 60 * 60 * 1000 - 1 : start;
  }
  return Date.parse(value);
}

export const stockLedgerQuerySchema = paginationQuery
  .extend({
    productId: z.string().uuid("productId must be a valid UUID").optional(),
    batchId: z.string().uuid("batchId must be a valid UUID").optional(),
    orderId: z.string().uuid("orderId must be a valid UUID").optional(),
    /** `ADJUSTMENT` is accepted as an alias of `MANUAL_ADJUSTMENT`. */
    reason: z
      .preprocess(
        (value) => (value === "ADJUSTMENT" ? "MANUAL_ADJUSTMENT" : value),
        z.enum(STOCK_HISTORY_REASONS, {
          errorMap: () => ({ message: `reason must be one of ${STOCK_HISTORY_REASONS.join(", ")}` }),
        }),
      )
      .optional(),
    from: dateOrDateTime.optional(),
    to: dateOrDateTime.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && boundInstant(data.from, false) > boundInstant(data.to, true)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "from must not be after to" });
    }
  });

// ---------------------------------------------------------------------------
// GET /admin/inventory/expiring-soon, /low-stock
// ---------------------------------------------------------------------------

export const expiringSoonQuerySchema = paginationQuery.extend({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const lowStockQuerySchema = paginationQuery;

// ---------------------------------------------------------------------------
// GET /admin/batches (batch inspector)
// ---------------------------------------------------------------------------

export const batchInspectorQuerySchema = paginationQuery.extend({
  status: z
    .enum(BATCH_HEALTH_STATUSES, {
      errorMap: () => ({ message: `status must be one of ${BATCH_HEALTH_STATUSES.join(", ")}` }),
    })
    .optional(),
  q: searchTerm.optional(),
  productId: z.string().uuid("productId must be a valid UUID").optional(),
  inStockOnly: booleanQueryParam.optional(),
});

export type ImportBatchBody = z.infer<typeof importBatchSchema>;
export type StockAdjustmentBody = z.infer<typeof stockAdjustmentSchema>;
export type StockLedgerQuery = z.infer<typeof stockLedgerQuerySchema>;
export type ExpiringSoonQuery = z.infer<typeof expiringSoonQuerySchema>;
export type BatchInspectorQuery = z.infer<typeof batchInspectorQuerySchema>;
