/**
 * Global error → envelope translation (`app.onError`) and 404 handler
 * (`app.notFound`). See lib/errors.ts for the conventions.
 */
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { env } from "../env";
import { findPgError, type PgErrorLike } from "../lib/db-errors";
import { AppError, ErrorCode, errorBody, type ApiErrorBody } from "../lib/errors";
import { formatZodError } from "../lib/validation";

const isDevelopment = (): boolean => env.NODE_ENV === "development";

const CONNECTION_ERROR_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN"]);

function isConnectionFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && CONNECTION_ERROR_CODES.has(code)) return true;
    if (/timeout exceeded when trying to connect|Connection terminated/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

interface MappedError {
  status: ContentfulStatusCode;
  body: ApiErrorBody;
  /** true when the error is unexpected and must be logged with its stack. */
  logAsError: boolean;
}

function mapPgError(pg: PgErrorLike): MappedError | null {
  const devDetails = isDevelopment()
    ? { sqlState: pg.code, constraint: pg.constraint, table: pg.table, column: pg.column }
    : undefined;
  const make = (status: ContentfulStatusCode, code: ErrorCode, message: string): MappedError => ({
    status,
    body: errorBody(code, message, devDetails),
    logAsError: false,
  });

  switch (pg.code) {
    case "23505": // unique_violation
      return make(409, ErrorCode.CONFLICT, "A record with the same unique value already exists.");
    case "23503": // foreign_key_violation
      return pg.detail?.includes("is still referenced")
        ? make(409, ErrorCode.CONFLICT, "This record is still referenced by other records.")
        : make(400, ErrorCode.BAD_REQUEST, "A referenced record does not exist.");
    case "23514": // check_violation
      return make(400, ErrorCode.BAD_REQUEST, "A value violates a data constraint.");
    case "23502": // not_null_violation
      return make(400, ErrorCode.BAD_REQUEST, "A required value is missing.");
    case "22P02": // invalid_text_representation (bad uuid, enum, number...)
      return make(400, ErrorCode.BAD_REQUEST, "A value has an invalid format.");
    case "22001": // string_data_right_truncation
      return make(400, ErrorCode.BAD_REQUEST, "A value is too long.");
    case "22003": // numeric_value_out_of_range
      return make(400, ErrorCode.BAD_REQUEST, "A numeric value is out of range.");
    case "22007": // invalid_datetime_format
    case "22008": // datetime_field_overflow
      return make(400, ErrorCode.BAD_REQUEST, "A date or time value is invalid.");
    case "40001": // serialization_failure
    case "40P01": // deadlock_detected
    case "55P03": // lock_not_available
      return make(409, ErrorCode.CONFLICT, "The resource is being modified concurrently. Please retry.");
    case "57014": // query_canceled (statement timeout)
    case "53300": // too_many_connections
    case "57P01": // admin_shutdown
    case "57P03": // cannot_connect_now
      return make(503, ErrorCode.SERVICE_UNAVAILABLE, "The service is temporarily unavailable. Please retry.");
    default:
      if (pg.code.startsWith("08")) {
        // connection_exception class
        return make(503, ErrorCode.SERVICE_UNAVAILABLE, "The service is temporarily unavailable. Please retry.");
      }
      return null;
  }
}

function mapHttpException(err: HTTPException): MappedError {
  const status = err.status;
  const message = err.message.trim();
  const pick = (code: ErrorCode, fallback: string): MappedError => ({
    status,
    body: errorBody(code, message || fallback),
    logAsError: false,
  });

  if (status >= 500) {
    return {
      status,
      body: errorBody(
        status === 503 ? ErrorCode.SERVICE_UNAVAILABLE : ErrorCode.INTERNAL_ERROR,
        isDevelopment() && message ? message : status === 503 ? "Service temporarily unavailable" : "Internal server error",
      ),
      logAsError: true,
    };
  }

  switch (status) {
    case 401:
      return pick(ErrorCode.UNAUTHORIZED, "Authentication required");
    case 403:
      return pick(ErrorCode.FORBIDDEN, "Forbidden");
    case 404:
      return pick(ErrorCode.NOT_FOUND, "Not found");
    case 409:
      return pick(ErrorCode.CONFLICT, "Conflict");
    case 422:
      return pick(ErrorCode.VALIDATION_ERROR, "Request validation failed");
    case 429:
      return pick(ErrorCode.RATE_LIMITED, "Too many requests. Please try again later.");
    default:
      // 400 "Malformed JSON in request body", 413, 415, ...
      return pick(ErrorCode.BAD_REQUEST, "Bad request");
  }
}

/** Translates any thrown value into a status + envelope. Exported for unit tests. */
export function mapError(err: unknown): MappedError {
  if (err instanceof AppError) {
    return {
      status: err.httpStatus,
      body: { success: false, error: err.toPayload() },
      logAsError: err.httpStatus >= 500,
    };
  }

  if (err instanceof HTTPException) {
    return mapHttpException(err);
  }

  if (err instanceof ZodError) {
    return {
      status: 422,
      body: errorBody(ErrorCode.VALIDATION_ERROR, "Validation failed", formatZodError(err)),
      logAsError: false,
    };
  }

  const pg = findPgError(err);
  if (pg) {
    const mapped = mapPgError(pg);
    if (mapped) return mapped;
  } else if (isConnectionFailure(err)) {
    return {
      status: 503,
      body: errorBody(ErrorCode.SERVICE_UNAVAILABLE, "The service is temporarily unavailable. Please retry."),
      logAsError: true,
    };
  }

  const message = err instanceof Error && isDevelopment() ? err.message : "Internal server error";
  const details =
    err instanceof Error && isDevelopment() && err.stack ? { stack: err.stack } : undefined;
  return {
    status: 500,
    body: errorBody(ErrorCode.INTERNAL_ERROR, message, details),
    logAsError: true,
  };
}

function logError(c: Context, err: unknown, status: number): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const pg = findPgError(err);
  const requestId: unknown = c.get("requestId");
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_failed",
      requestId: typeof requestId === "string" ? requestId : undefined,
      method: c.req.method,
      path: c.req.path,
      status,
      name: error.name,
      message: error.message,
      sqlState: pg?.code,
      stack: error.stack,
    }),
  );
}

export const errorHandler: ErrorHandler = (err, c) => {
  const mapped = mapError(err);
  if (mapped.logAsError) {
    logError(c, err, mapped.status);
  }
  if (mapped.status === 429 && err instanceof AppError) {
    const details = err.details as { retryAfterSeconds?: unknown } | undefined;
    if (typeof details?.retryAfterSeconds === "number") {
      c.header("Retry-After", String(details.retryAfterSeconds));
    }
  }
  return c.json(mapped.body, mapped.status);
};

export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(errorBody(ErrorCode.NOT_FOUND, `Route ${c.req.method} ${c.req.path} not found`), 404);
