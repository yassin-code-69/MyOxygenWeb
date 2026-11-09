import { describe, expect, it } from "bun:test";
import { AppError } from "../../lib/errors";
import type { CourierProvider, CreateParcelPayload, ParcelCancellation } from "./courier.interface";
import { CourierService } from "./courier.service";
import { MockCourierProvider } from "./mock.provider";
import { normalizeSteadfastStatus, SteadfastCourierProvider, type FetchLike } from "./steadfast.provider";

const samplePayload: CreateParcelPayload = {
  orderNumber: "ORD-20261109-TESTAAAA",
  recipientName: "Ayesha Rahman",
  recipientPhone: "01712345678",
  recipientAddress: "House 12, Road 5, Dhanmondi, Dhaka, Dhaka, 1205",
  codAmount: 1250,
  note: "Fragile baby glass bottles",
  weightKg: 1.2,
};

interface RecordedRequest {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(status: number, body: unknown, requests: RecordedRequest[] = []): FetchLike {
  return async (url, init) => {
    requests.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("Steadfast courier provider", () => {
  it("is not configured without credentials and refuses to book (503), never inventing tracking IDs", async () => {
    const provider = new SteadfastCourierProvider({ apiKey: "", secretKey: "" });
    expect(provider.isConfigured).toBe(false);
    const error = await provider.createParcel(samplePayload).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).httpStatus).toBe(503);
  });

  it("books a parcel through the API with the merchant invoice and credentials", async () => {
    const requests: RecordedRequest[] = [];
    const provider = new SteadfastCourierProvider({
      apiKey: "key",
      secretKey: "secret",
      baseUrl: "https://steadfast.test/api/v1/",
      fetchImpl: fakeFetch(
        200,
        {
          status: 200,
          message: "Consignment has been created successfully.",
          consignment: { consignment_id: 1424107, tracking_code: "15BAEB8A", status: "in_review" },
        },
        requests,
      ),
    });

    const booking = await provider.createParcel(samplePayload);
    expect(booking).toEqual({
      provider: "steadfast",
      trackingId: "15BAEB8A",
      consignmentId: "1424107",
      rawStatus: "in_review",
      normalizedStatus: "PENDING",
      labelUrl: null,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://steadfast.test/api/v1/create_order");
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("Api-Key")).toBe("key");
    expect(headers.get("Secret-Key")).toBe("secret");
    const sent = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>;
    expect(sent.invoice).toBe(samplePayload.orderNumber);
    expect(sent.cod_amount).toBe(1250);
    expect(sent.recipient_phone).toBe("01712345678");
  });

  it("maps provider rejections to a 502 AppError with the provider message", async () => {
    const provider = new SteadfastCourierProvider({
      apiKey: "key",
      secretKey: "secret",
      fetchImpl: fakeFetch(422, { status: 422, errors: { recipient_phone: ["invalid"] } }),
    });
    const error = await provider.createParcel(samplePayload).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).httpStatus).toBe(502);
    expect(JSON.stringify((error as AppError).details)).toContain("recipient_phone");
  });

  it("tracks by tracking code and normalizes the delivery status", async () => {
    const requests: RecordedRequest[] = [];
    const provider = new SteadfastCourierProvider({
      apiKey: "key",
      secretKey: "secret",
      baseUrl: "https://steadfast.test/api/v1",
      fetchImpl: fakeFetch(200, { status: 200, delivery_status: "delivered_approval_pending" }, requests),
    });
    const tracking = await provider.trackParcel("15BAEB8A");
    expect(requests[0]?.url).toBe("https://steadfast.test/api/v1/status_by_trackingcode/15BAEB8A");
    expect(tracking.rawStatus).toBe("delivered_approval_pending");
    expect(tracking.normalizedStatus).toBe("APPROVAL_PENDING");
  });

  it("reports cancellation as NOT_SUPPORTED instead of faking success", async () => {
    const provider = new SteadfastCourierProvider({ apiKey: "key", secretKey: "secret" });
    const result = await provider.cancelParcel("15BAEB8A");
    expect(result.status).toBe("NOT_SUPPORTED");
  });

  it("normalizes every documented Steadfast status without false positives", () => {
    expect(normalizeSteadfastStatus("in_review")).toBe("PENDING");
    expect(normalizeSteadfastStatus("pending")).toBe("IN_TRANSIT");
    expect(normalizeSteadfastStatus("hold")).toBe("ON_HOLD");
    expect(normalizeSteadfastStatus("delivered_approval_pending")).toBe("APPROVAL_PENDING");
    expect(normalizeSteadfastStatus("partial_delivered_approval_pending")).toBe("APPROVAL_PENDING");
    expect(normalizeSteadfastStatus("cancelled_approval_pending")).toBe("APPROVAL_PENDING");
    expect(normalizeSteadfastStatus("unknown_approval_pending")).toBe("APPROVAL_PENDING");
    expect(normalizeSteadfastStatus("delivered")).toBe("DELIVERED");
    expect(normalizeSteadfastStatus("Partial Delivered")).toBe("PARTIALLY_DELIVERED");
    expect(normalizeSteadfastStatus("cancelled")).toBe("CANCELLED");
    expect(normalizeSteadfastStatus("unknown")).toBe("UNKNOWN");
    expect(normalizeSteadfastStatus("something_new")).toBe("UNKNOWN");
  });
});

describe("Mock courier provider", () => {
  it("books, tracks and cancels parcels in memory", async () => {
    const provider = new MockCourierProvider();
    const booking = await provider.createParcel(samplePayload);
    expect(booking.provider).toBe("mock");
    expect(booking.trackingId).toMatch(/^MOCK-[0-9A-F]{12}$/);
    expect((await provider.trackParcel(booking.trackingId)).normalizedStatus).toBe("PENDING");

    const cancellation = await provider.cancelParcel(booking.trackingId);
    expect(cancellation.status).toBe("CANCELLED");
    expect((await provider.trackParcel(booking.trackingId)).normalizedStatus).toBe("CANCELLED");
  });

  it("refuses to cancel delivered or unknown parcels", async () => {
    const provider = new MockCourierProvider();
    const booking = await provider.createParcel(samplePayload);
    provider.setStatus(booking.trackingId, "DELIVERED");
    expect((await provider.cancelParcel(booking.trackingId)).status).toBe("FAILED");
    expect((await provider.cancelParcel("STF-123")).status).toBe("FAILED");
  });
});

describe("Courier registry", () => {
  it("resolves the default provider from configuration (case-insensitive)", () => {
    const service = new CourierService([new MockCourierProvider()], "MOCK");
    expect(service.getDefault().name).toBe("mock");
    expect(service.find("Mock")?.name).toBe("mock");
    expect(service.find("redx")).toBeNull();
  });

  it("refuses an unconfigured default provider with 503", () => {
    const service = new CourierService([new SteadfastCourierProvider({ apiKey: "", secretKey: "" })], "steadfast");
    expect(() => service.getDefault()).toThrow(AppError);
  });

  it("reports NOT_SUPPORTED for couriers without an integration and FAILED when a provider throws", async () => {
    const throwing: CourierProvider = {
      name: "flaky",
      isConfigured: true,
      createParcel: () => Promise.reject(new Error("unused")),
      trackParcel: () => Promise.reject(new Error("unused")),
      cancelParcel: (): Promise<ParcelCancellation> => Promise.reject(new Error("gateway timeout")),
    };
    const service = new CourierService([throwing], "flaky");

    const manual = await service.cancelParcel("pathao", "PTH-1");
    expect(manual.status).toBe("NOT_SUPPORTED");

    const failed = await service.cancelParcel("flaky", "FLK-1");
    expect(failed.status).toBe("FAILED");
    expect(failed.message).toContain("gateway timeout");
  });
});
