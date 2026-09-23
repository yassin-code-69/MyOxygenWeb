import { describe, expect, it } from "bun:test";
import { courierService, CourierService } from "./courier.service";
import { SteadfastCourierProvider } from "./steadfast.provider";
import type { CreateParcelPayload, ICourierProvider } from "./courier.interface";

describe("Courier Adapter & Steadfast Logistics Service", () => {
  const samplePayload: CreateParcelPayload = {
    orderNumber: "ORD-2026-TEST-9988",
    recipientName: "Ayesha Rahman",
    recipientPhone: "01712345678",
    recipientAddress: "House 12, Road 5, Dhanmondi, Dhaka",
    city: "Dhaka",
    codAmount: 1250,
    note: "Fragile baby glass bottles",
    weight: 1.2,
  };

  describe("1. Steadfast Provider Mock Mode", () => {
    it("should instantiate in mock mode when credentials are missing or forced", () => {
      const provider = new SteadfastCourierProvider({ forceMock: true });
      expect(provider.isMock).toBe(true);
      expect(provider.providerName).toBe("STEADFAST");
    });

    it("should create parcel in mock mode with valid tracking ID and consignment ID", async () => {
      const provider = new SteadfastCourierProvider({ forceMock: true });
      const result = await provider.createParcel(samplePayload);

      expect(result.provider).toBe("STEADFAST");
      expect(result.trackingId).toMatch(/^STF-MOCK-\d+-\d+$/);
      expect(result.consignmentId).toMatch(/^CID-\d+$/);
      expect(result.status).toBe("PENDING");
      expect(result.label).toContain(result.trackingId);
    });

    it("should track parcels in mock mode and infer normalized status from tracking code", async () => {
      const provider = new SteadfastCourierProvider({ forceMock: true });

      const pendingStatus = await provider.trackParcel("STF-MOCK-PENDING-001");
      expect(pendingStatus.normalizedStatus).toBe("PENDING");

      const inTransitStatus = await provider.trackParcel("STF-MOCK-123456");
      expect(inTransitStatus.normalizedStatus).toBe("IN_TRANSIT");

      const deliveredStatus = await provider.trackParcel("STF-MOCK-DELIVERED-002");
      expect(deliveredStatus.normalizedStatus).toBe("DELIVERED");

      const outStatus = await provider.trackParcel("STF-MOCK-OUT-003");
      expect(outStatus.normalizedStatus).toBe("OUT_FOR_DELIVERY");

      const cancelledStatus = await provider.trackParcel("STF-MOCK-CANCELLED-004");
      expect(cancelledStatus.normalizedStatus).toBe("CANCELLED");
    });

    it("should successfully cancel parcel in mock mode", async () => {
      const provider = new SteadfastCourierProvider({ forceMock: true });
      const result = await provider.cancelParcel("STF-MOCK-123");

      expect(result.success).toBe(true);
      expect(result.message).toContain("mock mode");
    });
  });

  describe("2. Status Normalization", () => {
    const provider = new SteadfastCourierProvider({ forceMock: true });

    it("should correctly map Steadfast status strings to NormalizedCourierStatus", () => {
      expect(provider.normalizeStatus("in_review")).toBe("PENDING");
      expect(provider.normalizeStatus("pending")).toBe("PENDING");
      expect(provider.normalizeStatus("hold")).toBe("PENDING");
      expect(provider.normalizeStatus("in_transit")).toBe("IN_TRANSIT");
      expect(provider.normalizeStatus("picked_up")).toBe("IN_TRANSIT");
      expect(provider.normalizeStatus("out_for_delivery")).toBe("OUT_FOR_DELIVERY");
      expect(provider.normalizeStatus("delivered")).toBe("DELIVERED");
      expect(provider.normalizeStatus("partial_delivered")).toBe("DELIVERED");
      expect(provider.normalizeStatus("cancelled")).toBe("CANCELLED");
      expect(provider.normalizeStatus("return")).toBe("RETURNED");
      expect(provider.normalizeStatus("returned")).toBe("RETURNED");
      expect(provider.normalizeStatus("unknown_status_xyz")).toBe("UNKNOWN");
    });
  });

  describe("3. Courier Factory & Singleton Service", () => {
    it("should resolve default provider as Steadfast and create parcel", async () => {
      const result = await courierService.createParcel(samplePayload);

      expect(result.provider).toBe("STEADFAST");
      expect(result.trackingId).toBeDefined();
      expect(result.consignmentId).toBeDefined();
    });

    it("should allow registering and querying custom mock courier providers", async () => {
      const customMockProvider: ICourierProvider = {
        providerName: "REDX",
        isMock: true,
        createParcel: async (p) => ({
          trackingId: `REDX-${p.orderNumber}`,
          consignmentId: "REDX-CID-100",
          provider: "REDX",
          status: "PENDING",
        }),
        trackParcel: async (tid) => ({
          trackingId: tid,
          status: "in_transit",
          normalizedStatus: "IN_TRANSIT",
          lastUpdated: new Date(),
        }),
        cancelParcel: async () => ({ success: true }),
      };

      const customService = new CourierService();
      customService.registerProvider(customMockProvider);

      const customResult = await customService.createParcel(samplePayload, "REDX");
      expect(customResult.provider).toBe("REDX");
      expect(customResult.trackingId).toBe(`REDX-${samplePayload.orderNumber}`);

      const tracked = await customService.trackParcel("REDX-123", "REDX");
      expect(tracked.normalizedStatus).toBe("IN_TRANSIT");
    });

    it("should throw an error when querying an unregistered courier provider", () => {
      expect(() => courierService.getProvider("NON_EXISTENT_COURIER")).toThrow(
        /Courier provider "NON_EXISTENT_COURIER" is not registered/,
      );
    });
  });
});
