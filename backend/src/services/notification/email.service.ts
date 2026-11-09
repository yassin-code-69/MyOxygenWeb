/**
 * Transactional email via Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Configured by env.RESEND_API_KEY + env.EMAIL_FROM; without them every send
 * is reported as "skipped" — never as sent.
 */
import { z } from "zod";
import { env } from "../../env";
import type { DeliveryOutcome, EmailMessage, EmailProvider } from "./notification.interface";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ResendConfig {
  apiKey?: string;
  from?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

const RESEND_BASE_URL = "https://api.resend.com";
const MAX_REASON_LENGTH = 300;
const sendResponseSchema = z.object({ id: z.string() }).passthrough();

function truncate(text: string): string {
  return text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH)}…` : text;
}

export class ResendEmailProvider implements EmailProvider {
  readonly isConfigured: boolean;
  private readonly apiKey: string | undefined;
  private readonly from: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(config: ResendConfig = {}) {
    this.apiKey = config.apiKey ?? env.RESEND_API_KEY;
    this.from = config.from ?? env.EMAIL_FROM;
    this.baseUrl = (config.baseUrl ?? RESEND_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
    this.isConfigured = Boolean(this.apiKey && this.from);
  }

  async send(message: EmailMessage): Promise<DeliveryOutcome> {
    if (!this.isConfigured || this.apiKey === undefined || this.from === undefined) {
      return { status: "skipped", reason: "not configured (RESEND_API_KEY / EMAIL_FROM missing)" };
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (message.idempotencyKey) {
      headers["Idempotency-Key"] = message.idempotencyKey.slice(0, 256);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/emails`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return {
        status: "failed",
        reason: `Resend request failed: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
      };
    }

    const body = await response.text();
    if (!response.ok) {
      return {
        status: "failed",
        reason: `Resend responded ${response.status}: ${truncate(body)}`,
        retryable: response.status === 429 || response.status >= 500,
      };
    }

    let messageId: string | null = null;
    try {
      const parsed = sendResponseSchema.safeParse(JSON.parse(body) as unknown);
      messageId = parsed.success ? parsed.data.id : null;
    } catch {
      messageId = null;
    }
    return { status: "sent", messageId };
  }
}

export const emailProvider = new ResendEmailProvider();
