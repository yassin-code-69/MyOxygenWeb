/**
 * SMS via SSL Wireless SMS Plus v3 (Bangladesh).
 * Configured by env.SSL_WIRELESS_API_TOKEN + env.SSL_WIRELESS_SID (optional
 * SSL_WIRELESS_BASE_URL). Numbers are normalised to the 8801XXXXXXXXX MSISDN.
 * The csms_id is derived from the message reference, so a retried job reuses
 * the same id and the gateway rejects the duplicate instead of re-sending.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { env } from "../../env";
import { toBangladeshMsisdn } from "../phone";
import type { DeliveryOutcome, SmsMessage, SmsProvider } from "./notification.interface";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SslWirelessConfig {
  apiToken?: string;
  sid?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export const SSL_WIRELESS_DEFAULT_URL = "https://smsplus.sslwireless.com/api/v3/send-sms";
const MAX_REASON_LENGTH = 300;

const responseSchema = z
  .object({
    status: z.string().optional(),
    status_code: z.coerce.number().optional(),
    error_message: z.string().optional(),
    smsinfo: z
      .array(z.object({ sms_status: z.string().optional(), reference_id: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

function truncate(text: string): string {
  return text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH)}…` : text;
}

/** Stable 20-character csms_id (the gateway's maximum) for a message reference. */
export function csmsIdFor(reference: string): string {
  return createHash("sha256").update(reference).digest("hex").slice(0, 20);
}

export class SslWirelessSmsProvider implements SmsProvider {
  readonly isConfigured: boolean;
  private readonly apiToken: string | undefined;
  private readonly sid: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(config: SslWirelessConfig = {}) {
    this.apiToken = config.apiToken ?? env.SSL_WIRELESS_API_TOKEN;
    this.sid = config.sid ?? env.SSL_WIRELESS_SID;
    this.baseUrl = config.baseUrl ?? env.SSL_WIRELESS_BASE_URL ?? SSL_WIRELESS_DEFAULT_URL;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
    this.isConfigured = Boolean(this.apiToken && this.sid);
  }

  async send(message: SmsMessage): Promise<DeliveryOutcome> {
    if (!this.isConfigured) {
      return { status: "skipped", reason: "not configured (SSL_WIRELESS_API_TOKEN / SSL_WIRELESS_SID missing)" };
    }
    const msisdn = toBangladeshMsisdn(message.phone);
    if (msisdn === null) {
      return { status: "failed", reason: "recipient is not a valid Bangladeshi mobile number", retryable: false };
    }

    const csmsId = csmsIdFor(message.reference);
    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          api_token: this.apiToken,
          sid: this.sid,
          msisdn,
          sms: message.text,
          csms_id: csmsId,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return {
        status: "failed",
        reason: `SSL Wireless request failed: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
      };
    }

    const text = await response.text();
    if (!response.ok) {
      return {
        status: "failed",
        reason: `SSL Wireless responded ${response.status}: ${truncate(text)}`,
        retryable: response.status === 429 || response.status >= 500,
      };
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(text) as unknown;
    } catch {
      return { status: "failed", reason: "SSL Wireless returned a non-JSON response", retryable: true };
    }
    const parsed = responseSchema.safeParse(parsedBody);
    if (!parsed.success) {
      return { status: "failed", reason: "SSL Wireless returned an unexpected response", retryable: false };
    }
    if (parsed.data.status?.toUpperCase() !== "SUCCESS") {
      return {
        status: "failed",
        reason: `SSL Wireless rejected the SMS: ${truncate(parsed.data.error_message ?? parsed.data.status ?? "unknown error")}`,
        retryable: false,
      };
    }
    return { status: "sent", messageId: parsed.data.smsinfo?.[0]?.reference_id ?? csmsId };
  }
}

export const smsProvider = new SslWirelessSmsProvider();
