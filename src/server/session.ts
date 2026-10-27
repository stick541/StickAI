import { env } from "./env";
import { randomId, sign, verifySig } from "./crypto";
import { kv } from "./kv";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Signing key for login cookies. A fixed fallback is only allowed on a developer's machine, never in production. */
export function secret(): string {
  const s = env("SESSION_SECRET");
  if (s) return s;
  const mode = env("NODE_ENV");
  if (mode === "development" || mode === "test") return "dev-only-insecure-secret";
  throw new HttpError(503, "Server is missing SESSION_SECRET.");
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
}

/** Turns thrown errors into JSON responses. */
export function fail(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: "Something went wrong on the server." }, 500);
}

/** Blocks cross-site POST/PUT/DELETE requests (cookies are SameSite=Lax too). */
export function requireSameOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) throw new HttpError(403, "Cross-site request blocked.");
}

export interface Session { uid: string; registered: boolean }
export interface User { id: string; email: string; hash: string; createdAt: number }

const COOKIE = "stick_session";
const YEAR = 60 * 60 * 24 * 365;

function readCookie(request: Request, name: string): string | undefined {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export async function cookieFor(request: Request, uid: string): Promise<string> {
  const sig = await sign(secret(), uid);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${uid}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${YEAR}${secure}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Returns the current session. `setCookie` is present only when a new anonymous session was created. */
export async function getSession(request: Request): Promise<{ session: Session; setCookie?: string }> {
  const raw = readCookie(request, COOKIE);
  if (raw) {
    const dot = raw.lastIndexOf(".");
    const uid = raw.slice(0, dot);
    if (dot > 0 && (await verifySig(secret(), uid, raw.slice(dot + 1)))) {
      return { session: { uid, registered: uid.startsWith("u_") } };
    }
  }
  const uid = "a_" + randomId(16);
  return { session: { uid, registered: false }, setCookie: await cookieFor(request, uid) };
}

export function withCookie(res: Response, setCookie?: string): Response {
  if (setCookie) res.headers.append("set-cookie", setCookie);
  return res;
}

export async function getUser(uid: string): Promise<User | null> {
  return uid.startsWith("u_") ? kv().get<User>(`user:${uid}`) : null;
}
