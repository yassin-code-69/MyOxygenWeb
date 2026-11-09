/**
 * Minimal typed client for in-process HTTP tests (`app.request`).
 */
import { app } from "../index";
import type { PaginationMeta } from "../types";

export interface Envelope<T, M = PaginationMeta> {
  success: boolean;
  data: T;
  meta?: M;
  error?: { code: string; message: string; details?: unknown };
}

export interface ApiResult<T, M = PaginationMeta> {
  status: number;
  headers: Headers;
  body: Envelope<T, M>;
}

export async function api<T, M = PaginationMeta>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<ApiResult<T, M>> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await app.request(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = (await response.json()) as Envelope<T, M>;
  return { status: response.status, headers: response.headers, body };
}
