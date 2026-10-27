import { env } from "./env";
import { b64u, randomId, sign, timingSafeEqual, unb64u, verifySig } from "./crypto";
import { kv } from "./kv";
import { moveTokens } from "./providers";
import { cookieFor, getSession, secret, type User } from "./session";

export type LoginProvider = "google" | "apple";
export const isLoginProvider = (p: string): p is LoginProvider => p === "google" || p === "apple";

const google = () => ({ id: env("GOOGLE_CLIENT_ID"), secret: env("GOOGLE_CLIENT_SECRET") });
const apple = () => ({ id: env("APPLE_CLIENT_ID"), team: env("APPLE_TEAM_ID"), key: env("APPLE_KEY_ID"), pem: env("APPLE_PRIVATE_KEY") });

/** Which "Continue with…" buttons the server can really serve. */
export function loginProviders() {
  const g = google(), a = apple();
  return { google: !!(g.id && g.secret), apple: !!(a.id && a.team && a.key && a.pem) };
}

const base = (request: Request) => env("APP_URL")?.replace(/\/$/, "") ?? new URL(request.url).origin;
const callbackUrl = (request: Request, p: LoginProvider) => `${base(request)}/api/auth/${p}/callback`;
const home = (request: Request, query: string, cookies: string[] = []) => {
  const res = new Response(null, { status: 302, headers: { location: `${base(request)}/?${query}` } });
  for (const c of cookies) res.headers.append("set-cookie", c);
  return res;
};
const fail = (request: Request, message: string, cookies: string[] = []) => home(request, `auth_error=${encodeURIComponent(message)}`, cookies);

/** Short-lived cookie that ties the sign-in to this browser (stops "login CSRF"). SameSite=None so Apple's form POST carries it. */
function nonceCookie(request: Request, value: string, maxAge: number) {
  const https = new URL(request.url).protocol === "https:";
  return `stick_oauth=${value}; Path=/; HttpOnly; Max-Age=${maxAge}; ${https ? "SameSite=None; Secure" : "SameSite=Lax"}`;
}
const readCookie = (request: Request, name: string) => (request.headers.get("cookie") ?? "").split(";").map((s) => s.trim()).find((s) => s.startsWith(name + "="))?.slice(name.length + 1);

export async function startSocialLogin(request: Request, p: LoginProvider): Promise<Response> {
  if (!loginProviders()[p]) return fail(request, `${p === "google" ? "Google" : "Apple"} sign-in isn't set up on this server yet.`);
  const nonce = randomId(16);
  const data = b64u(new TextEncoder().encode(JSON.stringify({ p, n: nonce, exp: Date.now() + 10 * 60_000 })));
  const state = `${data}.${await sign(secret(), data)}`;
  const q = new URLSearchParams({ redirect_uri: callbackUrl(request, p), response_type: "code", state, nonce });
  let url: string;
  if (p === "google") {
    q.set("client_id", google().id!); q.set("scope", "openid email profile"); q.set("prompt", "select_account");
    url = `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  } else {
    q.set("client_id", apple().id!); q.set("scope", "name email"); q.set("response_mode", "form_post");
    url = `https://appleid.apple.com/auth/authorize?${q}`;
  }
  const res = new Response(null, { status: 302, headers: { location: url } });
  res.headers.append("set-cookie", nonceCookie(request, nonce, 600));
  return res;
}

/** Apple wants a client secret that is a short-lived ES256 JWT signed with your .p8 key. */
export async function appleClientSecret(): Promise<string> {
  const a = apple();
  const pem = a.pem!.replace(/\\n/g, "\n").replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", unb64u(pem.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: "ES256", kid: a.key });
  const body = enc({ iss: a.team, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: a.id });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

interface Claims { iss?: string; aud?: string; exp?: number; sub?: string; email?: string; email_verified?: boolean | string; nonce?: string }
const decodeClaims = (jwt: string): Claims => JSON.parse(new TextDecoder().decode(unb64u(jwt.split(".")[1] ?? "")));

async function exchange(request: Request, p: LoginProvider, code: string): Promise<string> {
  const body = new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: callbackUrl(request, p) });
  if (p === "google") { body.set("client_id", google().id!); body.set("client_secret", google().secret!); }
  else { body.set("client_id", apple().id!); body.set("client_secret", await appleClientSecret()); }
  const res = await fetch(p === "google" ? "https://oauth2.googleapis.com/token" : "https://appleid.apple.com/auth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const j = (await res.json().catch(() => ({}))) as { id_token?: string; error_description?: string; error?: string };
  if (!res.ok || !j.id_token) throw new Error(j.error_description ?? j.error ?? "The sign-in was rejected.");
  return j.id_token;
}

async function findOrCreateUser(p: LoginProvider, claims: Claims): Promise<User> {
  const store = kv();
  const sub = claims.sub!;
  const email = claims.email?.trim().toLowerCase();
  const verified = claims.email_verified === true || claims.email_verified === "true";

  const linked = await store.get<string>(`user:oauth:${p}:${sub}`);
  if (linked) { const u = await store.get<User>(`user:${linked}`); if (u) return u; }

  if (!email || !verified) throw new Error("Your account has no verified email address, so it can't be used to sign in here.");
  const existingId = await store.get<string>(`user:email:${email}`);
  let user = existingId ? await store.get<User>(`user:${existingId}`) : null;
  if (!user) {
    user = { id: "u_" + randomId(16), email, hash: "", createdAt: Date.now() }; // no password: sign-in only through the provider
    await store.set(`user:${user.id}`, user);
    await store.set(`user:email:${email}`, user.id);
  }
  await store.set(`user:oauth:${p}:${sub}`, user.id);
  return user;
}

export async function finishSocialLogin(request: Request, p: LoginProvider): Promise<Response> {
  const clear = nonceCookie(request, "", 0);
  try {
    // Google returns by GET; Apple returns by form POST.
    const params = request.method === "POST" ? new URLSearchParams(await request.text()) : new URL(request.url).searchParams;
    if (params.get("error")) return fail(request, "Sign-in was cancelled.", [clear]);
    const code = params.get("code");
    const [data, sig] = (params.get("state") ?? "").split(".");
    if (!code || !data || !sig || !(await verifySig(secret(), data, sig))) return fail(request, "That sign-in link isn't valid. Try again.", [clear]);
    const st = JSON.parse(new TextDecoder().decode(unb64u(data))) as { p: string; n: string; exp: number };
    const cookieNonce = readCookie(request, "stick_oauth") ?? "";
    if (st.p !== p || st.exp < Date.now() || !timingSafeEqual(cookieNonce, st.n)) return fail(request, "That sign-in expired or was started in a different browser. Try again.", [clear]);

    const claims = decodeClaims(await exchange(request, p, code));
    const okIss = p === "google" ? ["https://accounts.google.com", "accounts.google.com"].includes(claims.iss ?? "") : claims.iss === "https://appleid.apple.com";
    const clientId = p === "google" ? google().id : apple().id;
    if (!okIss || claims.aud !== clientId || (claims.exp ?? 0) * 1000 < Date.now() || claims.nonce !== st.n || !claims.sub) return fail(request, "The sign-in couldn't be verified. Try again.", [clear]);

    const user = await findOrCreateUser(p, claims);
    const { session } = await getSession(request);
    if (!session.registered) await moveTokens(session.uid, user.id);
    return home(request, "signed_in=1", [clear, await cookieFor(request, user.id)]);
  } catch (e) {
    console.error(e);
    return fail(request, e instanceof Error ? e.message : "Sign-in failed.", [clear]);
  }
}
