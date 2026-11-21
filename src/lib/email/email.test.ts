import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { canonicalAppUrl, emailConfig } from "./config";
import { buildEmail } from "./messages";
import { sendEmail } from "./provider";
import { dispatchAuthorized } from "./auth";
import { dispatchEmail } from "./dispatch";
import type postgres from "postgres";

const message = buildEmail("announcement", "private-token-123", "https://party.afam.party");
const input = { ...message, mode: "live" as const, email: "guest@example.com", from: "host@example.com", key: "private-key" };

describe("email configuration", () => {
  it("is off by default and requires no external account", () => {
    expect(emailConfig({}).mode).toBe("off");
    expect(emailConfig({ EMAIL_MODE: "dry-run" }).appUrl).toBe("http://localhost:3000");
  });
  it("fails closed for live mode without a public origin and credentials", () => {
    for (const value of ["http://localhost:3000", "https://127.0.0.1", "https://x.local", "https://host:secret@afam.party", "https://afam.party/path", "https://afam.party?key=secret", "https://afam.party/#x"]) {
      expect(() => canonicalAppUrl(value)).toThrow("invalid_app_url");
    }
    expect(() => emailConfig({ EMAIL_MODE: "live", EMAIL_APP_URL: "https://afam.party" })).toThrow("invalid_api_key");
    expect(() => emailConfig({ EMAIL_DAILY_LIMIT: "301" })).toThrow("invalid_daily_limit");
    expect(() => emailConfig({ EMAIL_DAILY_LIMIT: "12.5" })).toThrow("invalid_daily_limit");
  });
});

describe("private email templates", () => {
  it("links to the inbox without including arbitrary announcement or game secrets", () => {
    expect(message.subject).toBe("Announcement from Afam");
    expect(message.textContent).toContain("Afam posted an announcement");
    expect(message.textContent).toContain("https://party.afam.party/p/private-token-123");
    expect(message.textContent).toContain("Turn off emails on your personal page");
    expect(buildEmail("new_target", "private-token-123", "https://afam.party").textContent).not.toContain("target");
    expect(() => buildEmail("injected secret mission", "private-token-123", "https://afam.party")).toThrow("unsupported_email_kind");
    expect(() => buildEmail("hint", "token?steal=1", "https://afam.party")).toThrow("invalid_player_token");
  });
});

describe("Brevo boundary", () => {
  it("never performs HTTP in dry-run", async () => {
    const fetcher = vi.fn();
    expect(await sendEmail({ ...input, mode: "dry-run" }, fetcher)).toEqual({ status: "dry_run" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends only server credentials and stores acceptance separately from delivery", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "<accepted@brevo>" }), { status: 201 }));
    expect(await sendEmail(input, fetcher)).toEqual({ status: "sent", providerId: "<accepted@brevo>" });
    expect(fetcher.mock.calls[0][0]).toBe("https://api.brevo.com/v3/smtp/email");
    const request = fetcher.mock.calls[0][1];
    expect(request.headers["api-key"]).toBe("private-key");
    expect(JSON.parse(request.body)).toEqual({ sender: { name: "Secret Mission", email: "host@example.com" },
      to: [{ email: "guest@example.com" }], subject: message.subject, textContent: message.textContent });
  });
  it("treats network timeout and 5xx as uncertain without retrying", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("secret address or API key must not leak"));
    expect(await sendEmail(input, fetcher)).toEqual({ status: "unknown", errorCode: "provider_request_uncertain" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const serverError = vi.fn().mockResolvedValue(new Response("secret raw provider error", { status: 500 }));
    expect(await sendEmail(input, serverError)).toEqual({ status: "unknown", errorCode: "provider_http_uncertain" });
  });
  it("redacts rejection reasons and treats missing acceptance IDs as uncertain", async () => {
    const reject = vi.fn().mockResolvedValue(new Response("guest@example.com secret", { status: 400 }));
    expect(await sendEmail(input, reject)).toEqual({ status: "failed", errorCode: "provider_rejected" });
    const missingId = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    expect(await sendEmail(input, missingId)).toEqual({ status: "unknown", errorCode: "invalid_provider_response" });
  });
  it("rejects malformed recipients without HTTP", async () => {
    const fetcher = vi.fn();
    expect(await sendEmail({ ...input, email: "a@example.com\r\nBcc:other@example.com" }, fetcher)).toEqual({ status: "failed", errorCode: "invalid_email" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("dispatch authorization", () => {
  const secret = "a".repeat(40);
  it("requires a strong exact bearer secret", () => {
    const request = (value: string) => new Request("https://afam.party/api/email/dispatch", { headers: { authorization: value } });
    expect(dispatchAuthorized(request(`Bearer ${secret}`), { EMAIL_DISPATCH_SECRET: secret })).toBe(true);
    expect(dispatchAuthorized(request(`Bearer ${secret}x`), { EMAIL_DISPATCH_SECRET: secret })).toBe(false);
    expect(dispatchAuthorized(request(`Bearer ${secret}`), { EMAIL_DISPATCH_SECRET: "short" })).toBe(false);
    expect(dispatchAuthorized(request(`Basic ${secret}`), { EMAIL_DISPATCH_SECRET: secret })).toBe(false);
  });
  it("does not touch the database or provider when notifications are disabled or email is off", async () => {
    const sql = vi.fn() as unknown as postgres.Sql;
    expect(await dispatchEmail(sql, { env: {} })).toMatchObject({ processed: 0, stopped: "disabled" });
    expect(await dispatchEmail(sql, { env: { NOTIFICATIONS_ENABLED: "true" } })).toMatchObject({ processed: 0, stopped: "off" });
    expect(sql).not.toHaveBeenCalled();
  });
});
