/**
 * In-memory courier for local development and tests (COURIER_PROVIDER=mock).
 * It is explicit about being a simulation: tracking IDs start with "MOCK-".
 */
import { randomBytes } from "node:crypto";
import type {
  CourierProvider,
  CreateParcelPayload,
  NormalizedCourierStatus,
  ParcelBooking,
  ParcelCancellation,
  ParcelTracking,
} from "./courier.interface";

export const MOCK_TRACKING_PREFIX = "MOCK-";

export class MockCourierProvider implements CourierProvider {
  readonly name: string;
  readonly isConfigured = true;
  private readonly parcels = new Map<string, NormalizedCourierStatus>();

  constructor(name = "mock") {
    this.name = name;
  }

  async createParcel(payload: CreateParcelPayload): Promise<ParcelBooking> {
    const trackingId = `${MOCK_TRACKING_PREFIX}${randomBytes(6).toString("hex").toUpperCase()}`;
    this.parcels.set(trackingId, "PENDING");
    return {
      provider: this.name,
      trackingId,
      consignmentId: `MOCK-CID-${payload.orderNumber}`,
      rawStatus: "pending",
      normalizedStatus: "PENDING",
      labelUrl: null,
    };
  }

  async trackParcel(trackingId: string): Promise<ParcelTracking> {
    const known = this.parcels.get(trackingId);
    const normalizedStatus: NormalizedCourierStatus =
      known ?? (trackingId.startsWith(MOCK_TRACKING_PREFIX) ? "IN_TRANSIT" : "UNKNOWN");
    return {
      provider: this.name,
      trackingId,
      rawStatus: normalizedStatus.toLowerCase(),
      normalizedStatus,
      checkedAt: new Date(),
    };
  }

  async cancelParcel(trackingId: string): Promise<ParcelCancellation> {
    if (!trackingId.startsWith(MOCK_TRACKING_PREFIX)) {
      return { provider: this.name, trackingId, status: "FAILED", message: "Unknown mock tracking ID" };
    }
    const current = this.parcels.get(trackingId);
    if (current === "DELIVERED") {
      return { provider: this.name, trackingId, status: "FAILED", message: "Parcel is already delivered" };
    }
    this.parcels.set(trackingId, "CANCELLED");
    return { provider: this.name, trackingId, status: "CANCELLED", message: "Parcel cancelled (mock courier)" };
  }

  /** Simulates a courier-side status change (dev/test helper). */
  setStatus(trackingId: string, status: NormalizedCourierStatus): void {
    this.parcels.set(trackingId, status);
  }
}
