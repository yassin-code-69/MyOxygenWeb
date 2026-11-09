/**
 * Courier provider registry. The default provider is env.COURIER_PROVIDER
 * ("steadfast" | "mock"); orders remember the provider that booked them in
 * orders.courier_provider, so tracking/cancellation always talk to the right
 * courier even after the default changes.
 */
import { env, isProduction } from "../../env";
import { AppError } from "../../lib/errors";
import type { CourierProvider, ParcelCancellation, ParcelTracking } from "./courier.interface";
import { MockCourierProvider } from "./mock.provider";
import { SteadfastCourierProvider } from "./steadfast.provider";

export class CourierService {
  private readonly providers = new Map<string, CourierProvider>();

  constructor(
    providers: readonly CourierProvider[],
    private readonly defaultProviderName: string,
  ) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider: CourierProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  /** Provider by name (case-insensitive) or null when none is registered. */
  find(name: string | null | undefined): CourierProvider | null {
    if (!name) return null;
    return this.providers.get(name.trim().toLowerCase()) ?? null;
  }

  get defaultName(): string {
    return this.defaultProviderName;
  }

  /** The provider used for new dispatches. Throws 503 when unavailable. */
  getDefault(): CourierProvider {
    const provider = this.find(this.defaultProviderName);
    if (provider === null) {
      throw AppError.serviceUnavailable(`Courier provider "${this.defaultProviderName}" is not available`);
    }
    if (!provider.isConfigured) {
      throw AppError.serviceUnavailable(
        `The ${provider.name} courier is not configured. Add its credentials or set COURIER_PROVIDER=mock.`,
      );
    }
    return provider;
  }

  /** Live status from the provider that booked the parcel. Throws AppError on failure. */
  async trackParcel(providerName: string | null, trackingId: string): Promise<ParcelTracking> {
    const provider = this.find(providerName);
    if (provider === null) {
      throw AppError.serviceUnavailable(`Live tracking is not available for courier "${providerName ?? "unknown"}"`);
    }
    return provider.trackParcel(trackingId);
  }

  /** Never throws; never reports a cancellation that did not happen. */
  async cancelParcel(providerName: string | null, trackingId: string): Promise<ParcelCancellation> {
    const provider = this.find(providerName);
    if (provider === null) {
      return {
        provider: providerName ?? "unknown",
        trackingId,
        status: "NOT_SUPPORTED",
        message: `Courier "${providerName ?? "unknown"}" has no API integration. Cancel the parcel with the courier directly.`,
      };
    }
    try {
      return await provider.cancelParcel(trackingId);
    } catch (error) {
      return {
        provider: provider.name,
        trackingId,
        status: "FAILED",
        message: error instanceof Error ? error.message : "Courier cancellation failed",
      };
    }
  }
}

export function createCourierService(): CourierService {
  if (isProduction && env.COURIER_PROVIDER === "mock") {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "courier_mock_in_production",
        message: "COURIER_PROVIDER=mock in production: parcels are NOT booked with a real courier",
      }),
    );
  }
  return new CourierService([new SteadfastCourierProvider(), new MockCourierProvider()], env.COURIER_PROVIDER);
}

export const courierService = createCourierService();
