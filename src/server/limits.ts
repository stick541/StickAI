import { env } from "./env";
import { kv } from "./kv";
import { HttpError } from "./session";

/** Fixed-window counter: allows `limit` calls per `windowSec`, then answers 429 until the window ends. */
export async function throttle(key: string, limit: number, windowSec: number, message = "Too many requests. Try again later.") {
  const store = kv();
  const now = Date.now();
  let rec = await store.get<{ n: number; reset: number }>(key);
  if (!rec || rec.reset <= now) rec = { n: 0, reset: now + windowSec * 1000 };
  rec.n += 1;
  await store.set(key, rec, Math.max(1, Math.ceil((rec.reset - now) / 1000)));
  if (rec.n > limit) throw new HttpError(429, message);
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Chat and images need an account unless the host sets STICK_ALLOW_GUESTS=true (handy for local testing). */
export const loginRequired = () => env("STICK_ALLOW_GUESTS") !== "true";

export function requireAccount(session: { registered: boolean }) {
  if (loginRequired() && !session.registered) throw new HttpError(401, "Sign in to use Stick.");
}
