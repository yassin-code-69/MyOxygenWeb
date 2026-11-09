/**
 * Helpers for recognising Postgres errors (SQLSTATE codes) thrown through
 * node-postgres / Drizzle. Use these in services when a specific constraint
 * deserves a better message than the generic mapping in the error handler:
 *
 *   } catch (error) {
 *     if (isUniqueViolation(error, "products_sku_unique")) throw AppError.conflict("SKU already exists");
 *     throw error;
 *   }
 */

/** Minimal structural view of a node-postgres `DatabaseError`. */
export interface PgErrorLike {
  code: string;
  severity?: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

export const PgErrorCode = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
  NOT_NULL_VIOLATION: "23502",
  INVALID_TEXT_REPRESENTATION: "22P02",
  SERIALIZATION_FAILURE: "40001",
  DEADLOCK_DETECTED: "40P01",
  LOCK_NOT_AVAILABLE: "55P03",
} as const;

const SQLSTATE = /^[0-9A-Z]{5}$/;

function isPgErrorLike(value: unknown): value is PgErrorLike {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { code?: unknown; severity?: unknown };
  return (
    typeof candidate.code === "string" &&
    SQLSTATE.test(candidate.code) &&
    typeof candidate.severity === "string"
  );
}

/** Walks the `cause` chain (Drizzle may wrap driver errors) looking for a Postgres error. */
export function findPgError(error: unknown): PgErrorLike | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth++) {
    if (isPgErrorLike(current)) return current;
    current = current instanceof Error ? current.cause : undefined;
  }
  return null;
}

function matches(error: unknown, code: string, constraint?: string): boolean {
  const pg = findPgError(error);
  return pg !== null && pg.code === code && (constraint === undefined || pg.constraint === constraint);
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return matches(error, PgErrorCode.UNIQUE_VIOLATION, constraint);
}

export function isForeignKeyViolation(error: unknown, constraint?: string): boolean {
  return matches(error, PgErrorCode.FOREIGN_KEY_VIOLATION, constraint);
}

export function isCheckViolation(error: unknown, constraint?: string): boolean {
  return matches(error, PgErrorCode.CHECK_VIOLATION, constraint);
}
