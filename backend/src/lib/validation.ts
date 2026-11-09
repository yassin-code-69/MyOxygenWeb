/**
 * Request validation helpers.
 *
 *   route.get("/:id", validate("param", uuidParam), validate("query", paginationQuery), (c) => {
 *     const { id } = c.req.valid("param");
 *     const { page, limit } = c.req.valid("query");
 *   });
 *
 * Validation failures throw `AppError.validation(...)` → 422 with
 * `details = { target, formErrors, fieldErrors }` (Zod `flatten()` output).
 * Malformed JSON bodies are rejected by Hono before Zod runs → 400 BAD_REQUEST.
 */
import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import { z, type ZodError, type ZodSchema } from "zod";
import { AppError } from "./errors";

export interface ValidationErrorDetails {
  target?: keyof ValidationTargets;
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
}

export function formatZodError(error: ZodError, target?: keyof ValidationTargets): ValidationErrorDetails {
  const flat = error.flatten();
  return target === undefined
    ? { formErrors: flat.formErrors, fieldErrors: flat.fieldErrors }
    : { target, formErrors: flat.formErrors, fieldErrors: flat.fieldErrors };
}

export function validate<Target extends keyof ValidationTargets, Schema extends ZodSchema>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw AppError.validation("Request validation failed", formatZodError(result.error, target));
    }
  });
}

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

/** `:id` route param that must be a UUID. */
export const uuidParam = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

/** Builds a param schema where every listed key must be a UUID, e.g. `uuidParams("orderId", "itemId")`. */
export function uuidParams<const Keys extends readonly [string, ...string[]]>(...keys: Keys) {
  const shape = Object.fromEntries(
    keys.map((key) => [key, z.string().uuid(`${key} must be a valid UUID`)]),
  ) as { [K in Keys[number]]: z.ZodString };
  return z.object(shape);
}

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/** `?page=&limit=` — page ≥ 1 (default 1), 1 ≤ limit ≤ 100 (default 20). Values are coerced from strings. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;
