import { z } from "zod";

export const importBatchSchema = z
  .object({
    productId: z.string().uuid("productId must be a valid UUID"),
    batchNumber: z
      .string()
      .min(3, "Batch number must be at least 3 characters")
      .max(64),
    manufactureDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "manufactureDate must be YYYY-MM-DD format")
      .optional(),
    expiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "expiryDate must be YYYY-MM-DD format"),
    initialQuantity: z
      .number()
      .int("initialQuantity must be a whole number")
      .positive("initialQuantity must be greater than zero"),
  })
  .superRefine((data, ctx) => {
    if (data.manufactureDate && data.manufactureDate >= data.expiryDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "manufactureDate must be before expiryDate",
        path: ["manufactureDate"],
      });
    }
    const today = new Date().toISOString().split("T")[0];
    if (data.expiryDate <= today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot import a batch that has already expired",
        path: ["expiryDate"],
      });
    }
  });

export const stockAdjustmentSchema = z.object({
  productId: z.string().uuid("productId must be a valid UUID"),
  batchId: z.string().uuid("batchId must be a valid UUID").optional(),
  delta: z
    .number()
    .int("delta must be a whole number")
    .refine((v) => v !== 0, "delta cannot be zero"),
  reason: z.enum(
    ["IMPORT", "PURCHASE", "RETURN", "MANUAL_ADJUSTMENT", "EXPIRED_SCRAP"],
    { errorMap: () => ({ message: "Invalid stock history reason" }) },
  ),
  note: z.string().max(500).optional(),
});

export const stockLedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  productId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  reason: z
    .enum(["IMPORT", "PURCHASE", "RETURN", "MANUAL_ADJUSTMENT", "EXPIRED_SCRAP", "ADJUSTMENT"])
    .optional(),
});

export const expiringSoonQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type ImportBatchInput = z.infer<typeof importBatchSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type StockLedgerQueryInput = z.infer<typeof stockLedgerQuerySchema>;
export type ExpiringSoonQueryInput = z.infer<typeof expiringSoonQuerySchema>;
