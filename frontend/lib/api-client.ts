/**
 * Typed HTTP client for the My Oxygen API (see docs/API_CONTRACT.md).
 *
 * Use the `api` object everywhere:
 *   api.get<T>(path, params?)          → T (the unwrapped `data`)
 *   api.getPage<T>(path, params?)      → { items: T[]; meta }   (paginated lists)
 *   api.post / put / patch / delete<T> → T
 *   api.envelope<T>(path, options)     → full `{ success, data, meta }` envelope
 *   api.blob(path, params?)            → Blob (PDF invoices etc., authenticated)
 *   api.download(path, filename)       → saves a file in the browser
 *   swrFetcher                          → SWR fetcher for keys `path` or `[path, params]`
 *
 * Behaviour:
 * - Adds `Authorization: Bearer <accessToken>` from the auth store.
 * - On a 401 it refreshes the access token once (single-flight, shared by all
 *   concurrent requests) and retries; if the refresh fails the session is
 *   cleared via `logout()` and the 401 is rethrown.
 * - Every failure becomes an `ApiError` carrying the backend `code`, `message`
 *   and `details` (`fieldErrors` for validation errors).
 */
import { useAuthStore } from "./auth-store";
import type { ApiErrorCode, PaginationMeta } from "../types/api";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

/** Client-only codes added on top of the backend's error codes. */
export type ClientErrorCode = "NETWORK_ERROR" | "INVALID_RESPONSE";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | ClientErrorCode;
  readonly details?: unknown;

  constructor(message: string, status: number, code: ApiErrorCode | ClientErrorCode, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field errors from a 422 VALIDATION_ERROR (`details.fieldErrors`), keyed by field name. */
  get fieldErrors(): Record<string, string[]> {
    if (!isRecord(this.details)) {return {};}
    const fieldErrors = this.details.fieldErrors;
    if (!isRecord(fieldErrors)) {return {};}
    const result: Record<string, string[]> = {};
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (Array.isArray(messages)) {
        result[field] = messages.filter((message): message is string => typeof message === "string");
      }
    }
    return result;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Best human-readable message for any thrown value. */
export function getErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ApiError || error instanceof Error) {return error.message || fallback;}
  return fallback;
}

export type QueryPrimitive = string | number | boolean;
export type QueryValue = QueryPrimitive | null | undefined | readonly QueryPrimitive[];
export type QueryParams = Readonly<Record<string, QueryValue>>;

export interface SuccessEnvelope<T, M = PaginationMeta> {
  success: true;
  data: T;
  meta?: M;
}

export interface Page<T, M extends PaginationMeta = PaginationMeta> {
  items: T[];
  meta: M;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  params?: QueryParams;
  headers?: HeadersInit;
  signal?: AbortSignal;
  /** Send the bearer token (default true). */
  auth?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Builds an absolute API URL; array params are sent as repeated keys. */
export function buildUrl(path: string, params?: QueryParams): string {
  const url = new URL(/^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") {continue;}
      if (Array.isArray(value)) {
        for (const item of value) {url.searchParams.append(key, String(item));}
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

let refreshInFlight: Promise<string | null> | null = null;

/** Exchanges the stored refresh token for a new access token (single-flight). */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) {return refreshInFlight;}

  refreshInFlight = (async () => {
    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) {return null;}
    try {
      const response = await fetch(buildUrl("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {return null;}
      const json: unknown = await response.json();
      const token = isRecord(json) && isRecord(json.data) ? json.data.accessToken : undefined;
      if (typeof token !== "string" || token.length === 0) {return null;}
      useAuthStore.getState().setAccessToken(token);
      return token;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function isAuthEndpoint(path: string): boolean {
  return /^\/?auth\/(login|register|refresh)\b/.test(path.replace(API_BASE_URL, "").replace(/^\//, ""));
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";
  try {
    payload = contentType.includes("application/json") ? await response.json() : await response.text();
  } catch {
    payload = null;
  }

  if (isRecord(payload) && isRecord(payload.error)) {
    const { code, message, details } = payload.error;
    return new ApiError(
      typeof message === "string" && message ? message : `Request failed with status ${response.status}`,
      response.status,
      typeof code === "string" ? code : "INTERNAL_ERROR",
      details,
    );
  }
  if (isRecord(payload) && typeof payload.error === "string") {
    return new ApiError(payload.error, response.status, "INTERNAL_ERROR");
  }
  return new ApiError(`Request failed with status ${response.status}`, response.status, "INTERNAL_ERROR");
}

/** Sends a request (with one refresh-and-retry on 401) and returns the raw Response. */
async function send(path: string, options: RequestOptions = {}, accept = "application/json"): Promise<Response> {
  const { method = "GET", body, params, headers, signal, auth = true } = options;
  const url = buildUrl(path, params);

  const perform = (token: string | null): Promise<Response> => {
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Accept", accept);
    let payload: BodyInit | undefined;
    if (body instanceof FormData || body instanceof Blob) {
      payload = body;
    } else if (body !== undefined) {
      requestHeaders.set("Content-Type", "application/json");
      payload = JSON.stringify(body);
    }
    if (auth && token) {requestHeaders.set("Authorization", `Bearer ${token}`);}
    return fetch(url, { method, headers: requestHeaders, body: payload, signal });
  };

  let response: Response;
  try {
    const sentToken = auth ? useAuthStore.getState().accessToken : null;
    response = await perform(sentToken);
    // A 401 on a request that carried a session means the session is no longer
    // valid: refresh once if possible, otherwise (or if it still fails) sign out
    // so route guards send the user to /login.
    if (response.status === 401 && sentToken && !isAuthEndpoint(path)) {
      const refreshed = useAuthStore.getState().refreshToken ? await refreshAccessToken() : null;
      if (refreshed) {
        response = await perform(refreshed);
      }
      if (response.status === 401) {
        useAuthStore.getState().logout();
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {throw error;}
    throw new ApiError("Unable to reach the server. Check your connection and try again.", 0, "NETWORK_ERROR");
  }

  if (!response.ok) {throw await toApiError(response);}
  return response;
}

/** Performs a JSON request and returns the full success envelope. */
async function envelope<T, M = PaginationMeta>(path: string, options: RequestOptions = {}): Promise<SuccessEnvelope<T, M>> {
  const response = await send(path, options);
  if (response.status === 204) {return { success: true, data: undefined as T };}

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError("The server returned an unreadable response.", response.status, "INVALID_RESPONSE");
  }
  if (!isRecord(json) || json.success !== true || !("data" in json)) {
    throw new ApiError("The server returned an unexpected response.", response.status, "INVALID_RESPONSE");
  }
  return json as unknown as SuccessEnvelope<T, M>;
}

export const api = {
  envelope,

  async get<T>(path: string, params?: QueryParams, init?: Omit<RequestOptions, "method" | "params" | "body">): Promise<T> {
    return (await envelope<T>(path, { ...init, method: "GET", params })).data;
  },

  async getPage<T, M extends PaginationMeta = PaginationMeta>(
    path: string,
    params?: QueryParams,
    init?: Omit<RequestOptions, "method" | "params" | "body">,
  ): Promise<Page<T, M>> {
    const result = await envelope<T[], M>(path, { ...init, method: "GET", params });
    if (!result.meta) {
      throw new ApiError("Expected pagination metadata in the response.", 200, "INVALID_RESPONSE");
    }
    return { items: result.data, meta: result.meta };
  },

  async post<T>(path: string, body?: unknown, init?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return (await envelope<T>(path, { ...init, method: "POST", body })).data;
  },

  async put<T>(path: string, body?: unknown, init?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return (await envelope<T>(path, { ...init, method: "PUT", body })).data;
  },

  async patch<T>(path: string, body?: unknown, init?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return (await envelope<T>(path, { ...init, method: "PATCH", body })).data;
  },

  async delete<T>(path: string, init?: Omit<RequestOptions, "method">): Promise<T> {
    return (await envelope<T>(path, { ...init, method: "DELETE" })).data;
  },

  /** Authenticated binary download (e.g. invoice PDFs). */
  async blob(path: string, params?: QueryParams, accept = "application/pdf"): Promise<Blob> {
    const response = await send(path, { method: "GET", params }, accept);
    return response.blob();
  },

  /** Downloads a file through the API (with auth) and saves it in the browser. */
  async download(path: string, filename: string, params?: QueryParams): Promise<void> {
    const file = await api.blob(path, params, "*/*");
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoking immediately can abort the download in Safari / older Firefox.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  },

  /**
   * Opens an authenticated file (e.g. a PDF) in a new browser tab.
   * Call it directly from a click handler: the tab is opened synchronously
   * (before any await) so popup blockers allow it, then pointed at the file.
   * If the popup is blocked anyway, the file is downloaded instead.
   */
  async open(path: string, params?: QueryParams, fallbackFilename = "document.pdf"): Promise<void> {
    const tab = window.open("", "_blank");
    if (tab) {
      tab.opener = null;
    }
    try {
      const file = await api.blob(path, params);
      const objectUrl = URL.createObjectURL(file);
      if (tab && !tab.closed) {
        tab.location.href = objectUrl;
      } else {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fallbackFilename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      tab?.close();
      throw error;
    }
  },
};

/** SWR fetcher. Keys: `"/path"` or `["/path", params]`. Returns the unwrapped `data`. */
export function swrFetcher<T>(key: string | readonly [string, QueryParams?]): Promise<T> {
  if (typeof key === "string") {return api.get<T>(key);}
  const [path, params] = key;
  return api.get<T>(path, params);
}

/** SWR fetcher for paginated lists. Returns `{ items, meta }`. */
export function swrPageFetcher<T, M extends PaginationMeta = PaginationMeta>(
  key: string | readonly [string, QueryParams?],
): Promise<Page<T, M>> {
  if (typeof key === "string") {return api.getPage<T, M>(key);}
  const [path, params] = key;
  return api.getPage<T, M>(path, params);
}
