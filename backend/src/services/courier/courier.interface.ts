/**
 * Vendor-neutral courier contract. Providers are registered in
 * courier.service.ts and selected with env.COURIER_PROVIDER.
 *
 * Error contract:
 *  - createParcel / trackParcel throw AppError (503 when the provider is not
 *    configured, 502 when the provider rejects or cannot be reached).
 *  - cancelParcel NEVER throws and NEVER reports a cancellation that did not
 *    happen: it returns CANCELLED, NOT_SUPPORTED or FAILED.
 */
export const COURIER_PROVIDER_NAMES = ["steadfast", "mock"] as const;
export type CourierProviderName = (typeof COURIER_PROVIDER_NAMES)[number];

export const NORMALIZED_COURIER_STATUSES = [
  "PENDING",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "ON_HOLD",
  /** The courier recorded an outcome (delivered / cancelled / ...) that still awaits its own approval. */
  "APPROVAL_PENDING",
  "DELIVERED",
  "PARTIALLY_DELIVERED",
  "RETURNED",
  "CANCELLED",
  "UNKNOWN",
] as const;
export type NormalizedCourierStatus = (typeof NORMALIZED_COURIER_STATUSES)[number];

export interface CreateParcelPayload {
  /** Our order number; used as the courier's merchant invoice reference. */
  orderNumber: string;
  recipientName: string;
  /** 01XXXXXXXXX */
  recipientPhone: string;
  recipientAddress: string;
  /** Cash to collect on delivery (0 for prepaid orders). */
  codAmount: number;
  note?: string;
  weightKg?: number;
}

export interface ParcelBooking {
  provider: string;
  trackingId: string;
  consignmentId: string | null;
  rawStatus: string | null;
  normalizedStatus: NormalizedCourierStatus;
  labelUrl: string | null;
}

export interface ParcelTracking {
  provider: string;
  trackingId: string;
  rawStatus: string;
  normalizedStatus: NormalizedCourierStatus;
  checkedAt: Date;
}

export type ParcelCancellationStatus = "CANCELLED" | "NOT_SUPPORTED" | "FAILED";

export interface ParcelCancellation {
  provider: string;
  trackingId: string;
  status: ParcelCancellationStatus;
  message: string;
}

export interface CourierProvider {
  /** Registry key, lower-case (e.g. "steadfast"). Stored in orders.courier_provider. */
  readonly name: string;
  /** False when required credentials are missing. */
  readonly isConfigured: boolean;
  createParcel(payload: CreateParcelPayload): Promise<ParcelBooking>;
  trackParcel(trackingId: string): Promise<ParcelTracking>;
  cancelParcel(trackingId: string): Promise<ParcelCancellation>;
}
