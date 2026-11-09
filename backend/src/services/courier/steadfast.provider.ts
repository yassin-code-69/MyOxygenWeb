/**
 * Steadfast Courier (Bangladesh) merchant API v1 adapter.
 *
 * Credentials come from env (STEADFAST_API_KEY / STEADFAST_SECRET_KEY,
 * optional STEADFAST_BASE_URL). Without them the provider reports
 * `isConfigured = false` and refuses to book parcels (503) — it never invents
 * tracking numbers. Use COURIER_PROVIDER=mock for local development.
 *
 * Steadfast's public API has no endpoint to cancel a consignment, so
 * `cancelParcel` returns NOT_SUPPORTED instead of pretending to succeed.
 */
import { z } from "zod";
import { env } from "../../env";
import { AppError, ErrorCode } from "../../lib/errors";
import type {
  CourierProvider,
  CreateParcelPayload,
  NormalizedCourierStatus,
  ParcelBooking,
  ParcelCancellation,
  ParcelTracking,
} from "./courier.interface";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SteadfastConfig {
  apiKey?: string;
  secretKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export const STEADFAST_DEFAULT_BASE_URL = "https://portal.steadfast.com.bd/api/v1";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_PROVIDER_MESSAGE_LENGTH = 300;

/**
 * Steadfast delivery statuses → normalized statuses. "*_approval_pending"
 * means the rider recorded an outcome that Steadfast has not approved yet, so
 * it is deliberately NOT treated as final.
 */
const STEADFAST_STATUS_MAP: Readonly<Record<string, NormalizedCourierStatus>> = {
  in_review: "PENDING",
  pending: "IN_TRANSIT", // accepted by Steadfast, not yet delivered or cancelled
  hold: "ON_HOLD",
  delivered_approval_pending: "APPROVAL_PENDING",
  partial_delivered_approval_pending: "APPROVAL_PENDING",
  cancelled_approval_pending: "APPROVAL_PENDING",
  unknown_approval_pending: "APPROVAL_PENDING",
  delivered: "DELIVERED",
  partial_delivered: "PARTIALLY_DELIVERED",
  cancelled: "CANCELLED",
  unknown: "UNKNOWN",
};

export function normalizeSteadfastStatus(rawStatus: string): NormalizedCourierStatus {
  const key = rawStatus.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STEADFAST_STATUS_MAP[key] ?? "UNKNOWN";
}

const createOrderResponseSchema = z
  .object({
    status: z.coerce.number(),
    message: z.string().optional(),
    consignment: z
      .object({
        consignment_id: z.union([z.number(), z.string()]),
        tracking_code: z.string().trim().min(1),
        status: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const statusResponseSchema = z
  .object({
    status: z.coerce.number(),
    delivery_status: z.string().optional(),
  })
  .passthrough();

function truncate(text: string): string {
  return text.length > MAX_PROVIDER_MESSAGE_LENGTH ? `${text.slice(0, MAX_PROVIDER_MESSAGE_LENGTH)}…` : text;
}

function upstreamError(message: string, details: Record<string, unknown>, cause?: unknown): AppError {
  return new AppError(ErrorCode.SERVICE_UNAVAILABLE, message, { httpStatus: 502, details, cause });
}

export class SteadfastCourierProvider implements CourierProvider {
  readonly name = "steadfast";
  readonly isConfigured: boolean;
  private readonly apiKey: string | undefined;
  private readonly secretKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(config: SteadfastConfig = {}) {
    this.apiKey = config.apiKey ?? env.STEADFAST_API_KEY;
    this.secretKey = config.secretKey ?? env.STEADFAST_SECRET_KEY;
    this.baseUrl = (config.baseUrl ?? env.STEADFAST_BASE_URL ?? STEADFAST_DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
    this.isConfigured = Boolean(this.apiKey && this.secretKey);
  }

  async createParcel(payload: CreateParcelPayload): Promise<ParcelBooking> {
    const body = {
      invoice: payload.orderNumber,
      recipient_name: payload.recipientName.slice(0, 100),
      recipient_phone: payload.recipientPhone,
      recipient_address: payload.recipientAddress.slice(0, 250),
      cod_amount: Math.max(0, payload.codAmount),
      note: (payload.note ?? "").slice(0, 250),
    };

    const json = await this.request("/create_order", { method: "POST", body: JSON.stringify(body) });
    const parsed = createOrderResponseSchema.safeParse(json);
    if (!parsed.success || parsed.data.status !== 200 || parsed.data.consignment === undefined) {
      const message = parsed.success ? parsed.data.message : undefined;
      throw upstreamError("Steadfast could not book the parcel", {
        provider: this.name,
        providerMessage: truncate(message ?? JSON.stringify(json) ?? "unexpected response"),
      });
    }

    const consignment = parsed.data.consignment;
    const rawStatus = consignment.status ?? "in_review";
    return {
      provider: this.name,
      trackingId: consignment.tracking_code,
      consignmentId: String(consignment.consignment_id),
      rawStatus,
      normalizedStatus: normalizeSteadfastStatus(rawStatus),
      labelUrl: null,
    };
  }

  async trackParcel(trackingId: string): Promise<ParcelTracking> {
    const json = await this.request(`/status_by_trackingcode/${encodeURIComponent(trackingId)}`, { method: "GET" });
    const parsed = statusResponseSchema.safeParse(json);
    if (!parsed.success || parsed.data.status !== 200 || parsed.data.delivery_status === undefined) {
      throw upstreamError("Steadfast returned an unexpected tracking response", {
        provider: this.name,
        providerMessage: truncate(JSON.stringify(json) ?? "unexpected response"),
      });
    }
    return {
      provider: this.name,
      trackingId,
      rawStatus: parsed.data.delivery_status,
      normalizedStatus: normalizeSteadfastStatus(parsed.data.delivery_status),
      checkedAt: new Date(),
    };
  }

  async cancelParcel(trackingId: string): Promise<ParcelCancellation> {
    return {
      provider: this.name,
      trackingId,
      status: "NOT_SUPPORTED",
      message:
        "Steadfast's merchant API cannot cancel a consignment. Cancel it from the Steadfast merchant portal.",
    };
  }

  private async request(path: string, init: { method: "GET" | "POST"; body?: string }): Promise<unknown> {
    if (!this.isConfigured || this.apiKey === undefined || this.secretKey === undefined) {
      throw AppError.serviceUnavailable(
        "The Steadfast courier is not configured (STEADFAST_API_KEY / STEADFAST_SECRET_KEY are missing)",
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: {
          "Api-Key": this.apiKey,
          "Secret-Key": this.secretKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: init.body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw upstreamError("Steadfast courier is unreachable", { provider: this.name }, error);
    }

    const text = await response.text();
    if (!response.ok) {
      throw upstreamError("Steadfast rejected the request", {
        provider: this.name,
        providerStatus: response.status,
        providerMessage: truncate(text),
      });
    }

    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw upstreamError("Steadfast returned a non-JSON response", { provider: this.name }, error);
    }
  }
}
