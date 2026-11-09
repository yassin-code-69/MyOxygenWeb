/**
 * Success response helpers. Every successful JSON response must use one of
 * these so the envelope stays `{ success: true, data, meta? }`.
 *
 *   return ok(c, product);                         // 200
 *   return created(c, order);                      // 201
 *   return paginated(c, rows, { page, limit, total }); // 200 + meta
 *
 * Errors are never returned from here — throw `AppError` (see lib/errors.ts).
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiSuccess, PaginationMeta } from "../types";

export type { ApiSuccess, PaginationMeta };

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return c.json(body, status);
}

export function created<T>(c: Context, data: T): Response {
  return ok(c, data, 201);
}

/** 204 responses carry no body (and therefore no envelope). */
export function noContent(c: Context): Response {
  return c.body(null, 204);
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const safeLimit = Math.max(1, Math.trunc(limit));
  const safeTotal = Math.max(0, Math.trunc(total));
  return {
    page: Math.max(1, Math.trunc(page)),
    limit: safeLimit,
    total: safeTotal,
    totalPages: safeTotal === 0 ? 0 : Math.ceil(safeTotal / safeLimit),
  };
}

/** SQL OFFSET for a 1-based page. */
export function pageOffset(page: number, limit: number): number {
  return (Math.max(1, Math.trunc(page)) - 1) * Math.max(1, Math.trunc(limit));
}

export function paginated<T>(
  c: Context,
  items: T[],
  pagination: { page: number; limit: number; total: number },
): Response {
  const body: ApiSuccess<T[]> = {
    success: true,
    data: items,
    meta: buildPaginationMeta(pagination.page, pagination.limit, pagination.total),
  };
  return c.json(body, 200);
}
