import { db } from "@/lib/db/client";
import { dispatchAuthorized } from "@/lib/email/auth";
import { EmailConfigError } from "@/lib/email/config";
import { dispatchEmail, emailStatus } from "@/lib/email/dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: Request): Response | null {
  if (!dispatchAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.NOTIFICATIONS_ENABLED !== "true") return Response.json({ error: "notifications_disabled" }, { status: 503 });
  return null;
}

function errorResponse(error: unknown): Response {
  // Database/provider errors can contain recipient addresses and credentials.
  // Do not return, log, or interpolate the underlying error.
  return Response.json({ error: error instanceof EmailConfigError ? error.code : "dispatch_unavailable" }, { status: 503 });
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  try { return Response.json(await dispatchEmail(db()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  try { return Response.json(await emailStatus(db()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
