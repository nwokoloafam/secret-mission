import "server-only";
import { validEmail } from "./config";
import type { EmailMessage } from "./messages";

export type EmailSendResult =
  | { status: "dry_run" }
  | { status: "sent"; providerId: string }
  | { status: "failed" | "unknown"; errorCode: string };
export type EmailSendInput = EmailMessage & { mode: "dry-run" | "live"; key?: string; from?: string; email: string };

export async function sendEmail(input: EmailSendInput, fetcher: typeof fetch = fetch, timeoutMs = 8000): Promise<EmailSendResult> {
  if (!validEmail(input.email)) return { status: "failed", errorCode: "invalid_email" };
  if (!input.subject || /[\r\n]/.test(input.subject) || input.subject.length > 200 || input.textContent.length > 10000) {
    return { status: "failed", errorCode: "invalid_message" };
  }
  if (input.mode === "dry-run") return { status: "dry_run" };
  if (!input.key || !input.from || !validEmail(input.from)) return { status: "failed", errorCode: "invalid_provider_config" };
  try {
    const response = await fetcher("https://api.brevo.com/v3/smtp/email", {
      method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", accept: "application/json", "api-key": input.key },
      body: JSON.stringify({ sender: { name: "Secret Mission", email: input.from }, to: [{ email: input.email }],
        subject: input.subject, textContent: input.textContent }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Definite 4xx refusals are safe failures; transport/5xx outcomes can have
    // happened after provider acceptance, so they are terminal unknown states.
    if (response.status >= 400 && response.status < 500) return { status: "failed", errorCode: "provider_rejected" };
    if (response.status !== 201) return { status: "unknown", errorCode: "provider_http_uncertain" };
    const body: unknown = await response.json();
    const id = body && typeof body === "object" ? (body as Record<string, unknown>).messageId : undefined;
    if (typeof id === "string" && id.length > 0 && id.length <= 512 && !/[\r\n]/.test(id)) {
      return { status: "sent", providerId: id };
    }
    return { status: "unknown", errorCode: "invalid_provider_response" };
  } catch { return { status: "unknown", errorCode: "provider_request_uncertain" }; }
}
