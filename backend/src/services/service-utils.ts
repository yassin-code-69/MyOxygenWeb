/**
 * Small helpers shared by the catalog / inventory / discount services.
 */
import { AppError } from "../lib/errors";
import type { ValidationErrorDetails } from "../lib/validation";

/**
 * 422 VALIDATION_ERROR with the same `details` shape the request validator
 * produces (`{ formErrors, fieldErrors }`), for rules that need the database
 * (immutable fields, referenced rows, merged PATCH state...).
 */
export function fieldValidationError(fieldErrors: Record<string, string[]>, message?: string): AppError {
  const details: ValidationErrorDetails = { formErrors: [], fieldErrors };
  const first = Object.values(fieldErrors).flat()[0];
  return AppError.validation(message ?? first ?? "Request validation failed", details);
}

/** Escapes LIKE/ILIKE wildcards so user input is matched literally (default escape char `\`). */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `%input%` pattern for a literal "contains" ILIKE match. */
export function containsPattern(input: string): string {
  return `%${escapeLikePattern(input)}%`;
}

/** Converts a pg numeric (string) or number to a JS number, rejecting garbage instead of yielding NaN. */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RangeError(`Expected a finite numeric value, received "${String(value)}"`);
  }
  return parsed;
}

/** Same as `toNumber` but keeps `null` (nullable numeric columns). */
export function toNullableNumber(value: string | number | null | undefined): number | null {
  return value === null || value === undefined ? null : toNumber(value);
}

/** ISO-8601 string for a timestamptz value (Drizzle returns `Date`). */
export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toNullableIso(value: Date | string | null | undefined): string | null {
  return value === null || value === undefined ? null : toIso(value);
}
