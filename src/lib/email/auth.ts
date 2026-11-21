import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { EmailEnv } from "./config";

export function dispatchAuthorized(request: Request, env: EmailEnv = process.env): boolean {
  const secret = env.EMAIL_DISPATCH_SECRET;
  if (!secret || secret.length < 32 || secret.length > 256) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 300) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
