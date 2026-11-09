/**
 * Application error model — the ONLY way backend code should signal a failure
 * that reaches an HTTP client.
 *
 * Conventions (binding for every route, service and middleware):
 *
 * 1. Throw, don't format. Services and middleware `throw AppError.<kind>(...)`
 *    (e.g. `throw AppError.notFound("Product")`,
 *    `throw AppError.insufficientStock("Only 3 left", { productId, available: 3 })`).
 *    Never build `{ success: false, ... }` objects by hand and never
 *    `return c.json(..., 4xx)` for an error: the global handler in
 *    `middleware/error-handler.ts` turns every thrown error into the envelope
 *
 *        { "success": false, "error": { "code": ErrorCode, "message": string, "details"?: unknown } }
 *
 * 2. Success responses go through `lib/http.ts` (`ok`, `created`, `paginated`)
 *    so they always look like `{ success: true, data, meta? }`.
 *
 * 3. Request validation goes through `validate(target, schema)` from
 *    `lib/validation.ts`; failures become 422 VALIDATION_ERROR with
 *    flattened Zod `details`. A `ZodError` thrown from a service is mapped the
 *    same way.
 *
 * 4. Postgres errors may bubble up unhandled: unique violations become
 *    409 CONFLICT, FK violations 409/400, bad casts and CHECK violations 400.
 *    Catch them yourself only when you can produce a more specific message.
 *
 * 5. Messages must be safe to show to an end user. Never put SQL, stack
 *    traces, secrets or internal identifiers in `message`; put structured,
 *    non-sensitive context in `details`. Unknown errors are reported as a
 *    generic 500 INTERNAL_ERROR (the real message is only exposed when
 *    NODE_ENV === "development").
 */
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  INVALID_COUPON: "INVALID_COUPON",
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
  RATE_LIMITED: "RATE_LIMITED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Default HTTP status for every error code. */
export const ERROR_HTTP_STATUS: Readonly<Record<ErrorCode, ContentfulStatusCode>> = {
  VALIDATION_ERROR: 422,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  INVALID_COUPON: 422,
  INVALID_STATUS_TRANSITION: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/** Shape of `error` inside a failed response envelope. */
export interface ApiErrorPayload {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/** Full failed response envelope. */
export interface ApiErrorBody {
  success: false;
  error: ApiErrorPayload;
}

export interface AppErrorOptions {
  /** Overrides the default status for the code (rarely needed). */
  httpStatus?: ContentfulStatusCode;
  /** Structured, client-safe context (field names, ids, limits...). */
  details?: unknown;
  /** Underlying error, kept for server-side logging only. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: ContentfulStatusCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? ERROR_HTTP_STATUS[code];
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }

  /** Client-facing payload (never includes `cause` or the stack). */
  toPayload(): ApiErrorPayload {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }

  // ---------------------------------------------------------------------------
  // Convenience constructors
  // ---------------------------------------------------------------------------

  static validation(message = "Request validation failed", details?: unknown): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, { details });
  }

  static badRequest(message = "Bad request", details?: unknown): AppError {
    return new AppError(ErrorCode.BAD_REQUEST, message, { details });
  }

  static unauthorized(message = "Authentication required"): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message);
  }

  static forbidden(message = "You do not have permission to perform this action", details?: unknown): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message, { details });
  }

  /**
   * @param resource Human readable resource name, e.g. "Product" → "Product not found".
   * @param details  Optional context such as `{ id }`.
   */
  static notFound(resource = "Resource", details?: unknown): AppError {
    return new AppError(ErrorCode.NOT_FOUND, `${resource} not found`, { details });
  }

  static conflict(message = "The request conflicts with the current state of the resource", details?: unknown): AppError {
    return new AppError(ErrorCode.CONFLICT, message, { details });
  }

  static insufficientStock(message = "Insufficient stock", details?: unknown): AppError {
    return new AppError(ErrorCode.INSUFFICIENT_STOCK, message, { details });
  }

  static invalidCoupon(message = "Coupon is not valid", details?: unknown): AppError {
    return new AppError(ErrorCode.INVALID_COUPON, message, { details });
  }

  static invalidStatusTransition(from: string | null, to: string, message?: string): AppError {
    return new AppError(
      ErrorCode.INVALID_STATUS_TRANSITION,
      message ?? `Cannot change status from ${from ?? "NONE"} to ${to}`,
      { details: { from, to } },
    );
  }

  static rateLimited(message = "Too many requests. Please try again later.", retryAfterSeconds?: number): AppError {
    return new AppError(ErrorCode.RATE_LIMITED, message, {
      details: retryAfterSeconds === undefined ? undefined : { retryAfterSeconds },
    });
  }

  static serviceUnavailable(message = "Service temporarily unavailable", cause?: unknown): AppError {
    return new AppError(ErrorCode.SERVICE_UNAVAILABLE, message, { cause });
  }

  static internal(message = "Internal server error", cause?: unknown): AppError {
    return new AppError(ErrorCode.INTERNAL_ERROR, message, { cause });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Builds a failed envelope. Prefer throwing `AppError`; this exists for the handlers themselves. */
export function errorBody(code: ErrorCode, message: string, details?: unknown): ApiErrorBody {
  return {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}
