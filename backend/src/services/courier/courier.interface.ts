export type NormalizedCourierStatus =
  | "PENDING"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "RETURNED"
  | "CANCELLED"
  | "UNKNOWN";

export interface CreateParcelPayload {
  orderNumber: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  city?: string;
  codAmount: number;
  note?: string;
  weight?: number;
}

export interface ParcelCreatedResult {
  trackingId: string;
  consignmentId: string;
  label?: string;
  provider: string;
  status: NormalizedCourierStatus;
}

export interface ParcelStatus {
  trackingId: string;
  consignmentId?: string;
  status: string;
  normalizedStatus: NormalizedCourierStatus;
  lastUpdated: Date;
  rawResponse?: unknown;
}

export interface ICourierProvider {
  readonly providerName: string;
  readonly isMock: boolean;
  createParcel(payload: CreateParcelPayload): Promise<ParcelCreatedResult>;
  trackParcel(trackingId: string): Promise<ParcelStatus>;
  cancelParcel(trackingId: string): Promise<{ success: boolean; message?: string }>;
}
