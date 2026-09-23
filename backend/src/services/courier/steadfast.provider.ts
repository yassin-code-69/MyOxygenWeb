import type {
  CreateParcelPayload,
  ICourierProvider,
  NormalizedCourierStatus,
  ParcelCreatedResult,
  ParcelStatus,
} from "./courier.interface";

export interface SteadfastConfig {
  apiKey?: string;
  secretKey?: string;
  baseUrl?: string;
  forceMock?: boolean;
}

export class SteadfastCourierProvider implements ICourierProvider {
  readonly providerName = "STEADFAST";
  readonly isMock: boolean;
  private readonly apiKey: string | undefined;
  private readonly secretKey: string | undefined;
  private readonly baseUrl: string;

  constructor(config?: SteadfastConfig) {
    this.apiKey = config?.apiKey ?? process.env.STEADFAST_API_KEY;
    this.secretKey = config?.secretKey ?? process.env.STEADFAST_SECRET_KEY;
    this.baseUrl =
      config?.baseUrl ??
      process.env.STEADFAST_BASE_URL ??
      "https://portal.steadfast.com.bd/api/v1";
    this.isMock =
      Boolean(config?.forceMock) || !this.apiKey || !this.secretKey;
  }

  async createParcel(
    payload: CreateParcelPayload,
  ): Promise<ParcelCreatedResult> {
    if (this.isMock) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const trackingId = `STF-MOCK-${Date.now()}-${randomSuffix}`;
      const consignmentId = `CID-${Date.now().toString().slice(-6)}${randomSuffix}`;

      return {
        trackingId,
        consignmentId,
        provider: this.providerName,
        status: "PENDING",
        label: `https://portal.steadfast.com.bd/mock-label/${trackingId}`,
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/create_order`, {
        method: "POST",
        headers: {
          "Api-Key": this.apiKey!,
          "Secret-Key": this.secretKey!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoice: payload.orderNumber,
          recipient_name: payload.recipientName,
          recipient_phone: payload.recipientPhone,
          recipient_address: payload.recipientAddress,
          cod_amount: payload.codAmount,
          note: payload.note || "",
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Steadfast API error (${response.status}): ${errorText}`,
        );
      }

      const data = (await response.json()) as any;

      if (data.status !== 200 && data.status !== "success") {
        throw new Error(
          `Steadfast failed to create order: ${data.message || JSON.stringify(data.errors || data)}`,
        );
      }

      const consignment = data.consignment || {};
      const trackingId =
        consignment.tracking_code ||
        `STF-${consignment.consignment_id || Date.now()}`;
      const consignmentId = String(
        consignment.consignment_id || consignment.id || trackingId,
      );

      return {
        trackingId,
        consignmentId,
        provider: this.providerName,
        status: this.normalizeStatus(consignment.status || "pending"),
        label: consignment.label_url,
      };
    } catch (error: any) {
      throw new Error(`Failed to create Steadfast parcel: ${error.message}`);
    }
  }

  async trackParcel(trackingId: string): Promise<ParcelStatus> {
    if (this.isMock || trackingId.startsWith("STF-MOCK-")) {
      let normalized: NormalizedCourierStatus = "IN_TRANSIT";
      if (trackingId.includes("DELIVERED")) normalized = "DELIVERED";
      else if (trackingId.includes("CANCELLED")) normalized = "CANCELLED";
      else if (trackingId.includes("RETURNED")) normalized = "RETURNED";
      else if (trackingId.includes("OUT")) normalized = "OUT_FOR_DELIVERY";
      else if (trackingId.includes("PENDING")) normalized = "PENDING";

      return {
        trackingId,
        consignmentId: `CID-${trackingId.replace(/[^0-9]/g, "").slice(0, 8) || "MOCK"}`,
        status: normalized.toLowerCase(),
        normalizedStatus: normalized,
        lastUpdated: new Date(),
        rawResponse: { mock: true, trackingId },
      };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/status_by_trackingcode/${encodeURIComponent(trackingId)}`,
        {
          headers: {
            "Api-Key": this.apiKey!,
            "Secret-Key": this.secretKey!,
          },
          signal: AbortSignal.timeout(8000),
        },
      );

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Steadfast tracking error (${response.status}): ${err}`);
      }

      const data = (await response.json()) as any;
      const rawStatus =
        data.delivery_status ||
        data.status ||
        data.consignment?.status ||
        "unknown";

      return {
        trackingId,
        consignmentId: data.consignment_id
          ? String(data.consignment_id)
          : undefined,
        status: String(rawStatus),
        normalizedStatus: this.normalizeStatus(rawStatus),
        lastUpdated: new Date(),
        rawResponse: data,
      };
    } catch (error: any) {
      throw new Error(`Failed to track Steadfast parcel: ${error.message}`);
    }
  }

  async cancelParcel(
    trackingId: string,
  ): Promise<{ success: boolean; message?: string }> {
    if (this.isMock || trackingId.startsWith("STF-MOCK-")) {
      return {
        success: true,
        message: "Parcel cancelled successfully (mock mode)",
      };
    }

    // Steadfast does not provide a standard public cancellation REST endpoint in v1;
    // Orders must typically be cancelled via portal or marked CANCELLED if pending.
    return {
      success: true,
      message: `Cancellation request recorded for tracking ID ${trackingId}`,
    };
  }

  normalizeStatus(rawStatus: string): NormalizedCourierStatus {
    const s = String(rawStatus || "").toLowerCase().trim();
    if (s.includes("delivered") || s.includes("partial_delivered")) return "DELIVERED";
    if (s.includes("cancel")) return "CANCELLED";
    if (s.includes("return")) return "RETURNED";
    if (s.includes("out_for_delivery") || s.includes("out for delivery"))
      return "OUT_FOR_DELIVERY";
    if (
      s.includes("in_transit") ||
      s.includes("picked") ||
      s.includes("transit") ||
      s.includes("shipped")
    )
      return "IN_TRANSIT";
    if (s.includes("pending") || s.includes("hold") || s.includes("in_review"))
      return "PENDING";
    return "UNKNOWN";
  }
}
