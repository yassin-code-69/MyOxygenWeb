import type {
  CreateParcelPayload,
  ICourierProvider,
  ParcelCreatedResult,
  ParcelStatus,
} from "./courier.interface";
import { SteadfastCourierProvider } from "./steadfast.provider";

export class CourierService {
  private readonly providers: Map<string, ICourierProvider> = new Map();
  private defaultProviderName: string = "STEADFAST";

  constructor() {
    const steadfast = new SteadfastCourierProvider();
    this.registerProvider(steadfast);
  }

  registerProvider(provider: ICourierProvider): void {
    this.providers.set(provider.providerName.toUpperCase(), provider);
  }

  getProvider(name?: string): ICourierProvider {
    const targetName = (name || this.defaultProviderName).toUpperCase();
    const provider = this.providers.get(targetName);
    if (!provider) {
      throw new Error(`Courier provider "${targetName}" is not registered`);
    }
    return provider;
  }

  setDefaultProvider(name: string): void {
    if (!this.providers.has(name.toUpperCase())) {
      throw new Error(`Cannot set unknown provider "${name}" as default`);
    }
    this.defaultProviderName = name.toUpperCase();
  }

  async createParcel(
    payload: CreateParcelPayload,
    providerName?: string,
  ): Promise<ParcelCreatedResult> {
    const provider = this.getProvider(providerName);
    return await provider.createParcel(payload);
  }

  async trackParcel(
    trackingId: string,
    providerName?: string,
  ): Promise<ParcelStatus> {
    const provider = this.getProvider(providerName);
    return await provider.trackParcel(trackingId);
  }

  async cancelParcel(
    trackingId: string,
    providerName?: string,
  ): Promise<{ success: boolean; message?: string }> {
    const provider = this.getProvider(providerName);
    return await provider.cancelParcel(trackingId);
  }
}

export const courierService = new CourierService();
