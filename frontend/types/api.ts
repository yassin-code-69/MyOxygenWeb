/**
 * API envelope contracts — mirror `backend/src/types/index.ts` + `backend/src/lib/errors.ts`.
 *
 * Every JSON response is either
 *   ApiSuccess<T>  → { success: true,  data: T, meta?: PaginationMeta }
 *   ApiFailure     → { success: false, error: { code, message, details? } }
 */

/** Error codes emitted by the backend (`backend/src/lib/errors.ts`). */
export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INSUFFICIENT_STOCK",
  "INVALID_COUPON",
  "INVALID_STATUS_TRANSITION",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export type KnownApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Known codes keep autocomplete; unknown strings remain assignable. */
export type ApiErrorCode = KnownApiErrorCode | (string & {});

/** Shape of `error` inside a failed response envelope. */
export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
  /** Non-sensitive context (e.g. Zod field errors). Narrow before use. */
  details?: unknown;
}

/** Pagination metadata returned by every list endpoint (`meta`). */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  /** Legacy fields — some older endpoints still send them. Derive from page/totalPages instead. */
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
}

export interface ApiSuccess<T, M = PaginationMeta> {
  success: true;
  data: T;
  meta?: M;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorPayload;
}

/** Discriminated union of every response — narrow on `success`. */
export type ApiEnvelope<T, M = PaginationMeta> = ApiSuccess<T, M> | ApiFailure;

/** Paginated list response (meta is guaranteed). */
export type ApiPaginated<T> = ApiSuccess<T[], PaginationMeta> & { meta: PaginationMeta };

/** Type guard for the failure branch. */
export function isApiFailure<T, M>(response: ApiEnvelope<T, M>): response is ApiFailure {
  return response.success === false;
}

/**
 * @deprecated Loose legacy envelope (pre-remediation). Use `ApiEnvelope<T>`.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?:
    | {
        code?: string;
        message: string;
        details?: unknown;
      }
    | string;
}
