import { env } from "./env";
import { decryptJson, encryptJson } from "./crypto";
import { kv } from "./kv";
import { HttpError, secret } from "./session";

export type ProviderId = "google" | "slack" | "github";

/** Plugins that have a real server-side connection. */
export const PLUGIN_PROVIDER: Record<string, ProviderId> = {
  gmail: "google",
  "google-calendar": "google",
  "google-drive": "google",
  slack: "slack",
  github: "github",
};

const GOOGLE_SCOPES: Record<string, string[]> = {
  gmail: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"],
  "google-calendar": ["https://www.googleapis.com/auth/calendar.events"],
  "google-drive": ["https://www.googleapis.com/auth/drive.readonly"],
};
const SLACK_USER_SCOPES = ["search:read", "chat:write", "channels:read"];

export function providerOf(plugin: string): ProviderId {
  const p = PLUGIN_PROVIDER[plugin];
  if (!p) throw new Error(`No sign-in provider for plugin ${plugin}.`);
  return p;
}

export const providerConfig = (p: ProviderId) =>
  p === "google"
    ? { clientId: env("GOOGLE_CLIENT_ID"), clientSecret: env("GOOGLE_CLIENT_SECRET") }
    : p === "slack"
      ? { clientId: env("SLACK_CLIENT_ID"), clientSecret: env("SLACK_CLIENT_SECRET") }
      : { clientId: env("GITHUB_CLIENT_ID"), clientSecret: env("GITHUB_CLIENT_SECRET") };

export const isConfigured = (p: ProviderId) => {
  const c = providerConfig(p);
  return !!(c.clientId && c.clientSecret);
};

export function redirectUri(request: Request, p: ProviderId): string {
  const base = env("APP_URL")?.replace(/\/$/, "") ?? new URL(request.url).origin;
  return `${base}/api/oauth/${p}/callback`;
}

export function authorizeUrl(request: Request, plugin: string, state: string): string {
  const p = providerOf(plugin);
  const { clientId } = providerConfig(p);
  const redirect = redirectUri(request, p);
  if (p === "google") {
    const q = new URLSearchParams({
      client_id: clientId!, redirect_uri: redirect, response_type: "code", access_type: "offline", prompt: "consent",
      scope: (GOOGLE_SCOPES[plugin] ?? []).join(" "), state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  if (p === "github") {
    const q = new URLSearchParams({
      client_id: clientId!, redirect_uri: redirect, scope: "user,repo", state,
    });
    return `https://github.com/login/oauth/authorize?${q}`;
  }
  const q = new URLSearchParams({ client_id: clientId!, redirect_uri: redirect, user_scope: SLACK_USER_SCOPES.join(","), state });
  return `https://slack.com/oauth/v2/authorize?${q}`;
}

export interface TokenRecord { access_token: string; refresh_token?: string; expires_at?: number }

const tokKey = (uid: string, plugin: string) => `tok:${uid}:${plugin}`;
const idxKey = (uid: string) => `tokidx:${uid}`;

export async function saveToken(uid: string, plugin: string, rec: TokenRecord) {
  const store = kv();
  await store.set(tokKey(uid, plugin), await encryptJson(secret(), rec));
  const idx = (await store.get<string[]>(idxKey(uid))) ?? [];
  if (!idx.includes(plugin)) await store.set(idxKey(uid), [...idx, plugin]);
}

export async function loadToken(uid: string, plugin: string): Promise<TokenRecord | null> {
  const blob = await kv().get<string>(tokKey(uid, plugin));
  return blob ? decryptJson<TokenRecord>(secret(), blob) : null;
}

export async function deleteToken(uid: string, plugin: string) {
  const store = kv();
  await store.del(tokKey(uid, plugin));
  const idx = (await store.get<string[]>(idxKey(uid))) ?? [];
  await store.set(idxKey(uid), idx.filter((x) => x !== plugin));
}

/** Copies plugin connections from an anonymous session to a newly signed-in user. */
export async function moveTokens(from: string, to: string) {
  if (from === to) return;
  const store = kv();
  const idx = (await store.get<string[]>(idxKey(from))) ?? [];
  for (const plugin of idx) {
    const blob = await store.get<string>(tokKey(from, plugin));
    if (!blob) continue;
    if (!(await store.get(tokKey(to, plugin)))) {
      await store.set(tokKey(to, plugin), blob);
      const toIdx = (await store.get<string[]>(idxKey(to))) ?? [];
      if (!toIdx.includes(plugin)) await store.set(idxKey(to), [...toIdx, plugin]);
    }
    await store.del(tokKey(from, plugin));
  }
  await store.del(idxKey(from));
}

export async function exchangeCode(request: Request, plugin: string, code: string): Promise<TokenRecord> {
  const p = providerOf(plugin);
  const { clientId, clientSecret } = providerConfig(p);
  const body = new URLSearchParams({ client_id: clientId!, client_secret: clientSecret!, code, redirect_uri: redirectUri(request, p) });
  if (p === "google") {
    body.set("grant_type", "authorization_code");
    const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
    const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !j.access_token) throw new HttpError(400, j.error_description ?? "Google sign-in failed.");
    return { access_token: j.access_token, ...(j.refresh_token ? { refresh_token: j.refresh_token } : {}), expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 };
  }
  if (p === "github") {
    body.set("grant_type", "authorization_code");
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json" },
      body,
    });
    const j = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
    if (!res.ok || !j.access_token) throw new HttpError(400, j.error_description ?? j.error ?? "GitHub sign-in failed.");
    return { access_token: j.access_token };
  }
  const res = await fetch("https://slack.com/api/oauth.v2.access", { method: "POST", body });
  const j = (await res.json()) as { ok: boolean; error?: string; authed_user?: { access_token?: string } };
  if (!j.ok || !j.authed_user?.access_token) throw new HttpError(400, `Slack sign-in failed${j.error ? `: ${j.error}` : "."}`);
  return { access_token: j.authed_user.access_token };
}

/** Returns a valid access token, refreshing Google tokens when they are about to expire. */
export async function accessToken(uid: string, plugin: string): Promise<string> {
  const rec = await loadToken(uid, plugin);
  if (!rec) throw new Error("This plugin isn't connected. Ask the user to connect it from the Plugins page.");
  if (PLUGIN_PROVIDER[plugin] !== "google" || !rec.expires_at || rec.expires_at - 60_000 > Date.now()) return rec.access_token;
  if (!rec.refresh_token) throw new Error("Google access expired. Ask the user to reconnect the plugin.");
  const { clientId, clientSecret } = providerConfig("google");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: clientId!, client_secret: clientSecret!, refresh_token: rec.refresh_token, grant_type: "refresh_token" }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !j.access_token) throw new Error("Google access expired. Ask the user to reconnect the plugin.");
  const next: TokenRecord = { access_token: j.access_token, refresh_token: rec.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 };
  await saveToken(uid, plugin, next);
  return next.access_token;
}

export async function revoke(uid: string, plugin: string) {
  const rec = await loadToken(uid, plugin);
  if (!rec) return;
  if (PLUGIN_PROVIDER[plugin] === "google") {
    await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", body: new URLSearchParams({ token: rec.refresh_token ?? rec.access_token }) }).catch(() => {});
  } else if (PLUGIN_PROVIDER[plugin] === "slack") {
    await fetch("https://slack.com/api/auth.revoke", { method: "POST", headers: { Authorization: `Bearer ${rec.access_token}` } }).catch(() => {});
  }
}
