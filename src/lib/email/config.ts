import "server-only";

export type EmailEnv = Record<string, string | undefined>;
export class EmailConfigError extends Error {
  constructor(public code: string) { super(code); }
}

export function validEmail(value: string): boolean {
  return value.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(value);
}

export function canonicalAppUrl(value: string | undefined, allowLocal = false): string {
  if (!value) throw new EmailConfigError("invalid_app_url");
  let url: URL;
  try { url = new URL(value); } catch { throw new EmailConfigError("invalid_app_url"); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new EmailConfigError("invalid_app_url");
  }
  const host = url.hostname.toLowerCase();
  if (allowLocal && ["localhost", "127.0.0.1", "[::1]"].includes(host) && ["http:", "https:"].includes(url.protocol)) {
    return url.origin;
  }
  if (url.protocol !== "https:" || url.port || !host.includes(".") || host.includes(":") ||
      /^[\d.]+$/.test(host) || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) ||
      !/^[a-z0-9.-]+$/.test(host)) throw new EmailConfigError("invalid_app_url");
  return url.origin;
}

export function emailConfig(env: EmailEnv = process.env) {
  const mode = env.EMAIL_MODE ?? "off";
  if (mode !== "off" && mode !== "live" && mode !== "dry-run") throw new EmailConfigError("invalid_email_mode");
  const rawLimit = env.EMAIL_DAILY_LIMIT ?? "250";
  if (!/^\d+$/.test(rawLimit)) throw new EmailConfigError("invalid_daily_limit");
  const dailyLimit = Number(rawLimit);
  // The shared Brevo free account allows 300/day; leave room for account mail.
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 300) throw new EmailConfigError("invalid_daily_limit");
  const appUrl = mode === "off" ? undefined : canonicalAppUrl(env.EMAIL_APP_URL ?? (mode === "dry-run" ? "http://localhost:3000" : undefined), mode === "dry-run");
  const key = env.BREVO_API_KEY;
  const from = env.EMAIL_FROM;
  if (mode === "live" && (!key || key.trim() !== key || key.length < 8)) throw new EmailConfigError("invalid_api_key");
  if (mode === "live" && (!from || !validEmail(from))) throw new EmailConfigError("invalid_sender");
  return { mode, dailyLimit, appUrl, key, from } as const;
}
