import { accessToken, loadToken, PLUGIN_PROVIDER } from "./providers";
import { PLUGINS, type PluginTool } from "../lib/plugins";

export interface ToolContext { uid: string; timezone?: string }
/** Every argument any plugin tool can receive (the model supplies them as JSON). */
interface Args {
  query?: unknown; limit?: unknown; subject?: unknown; to?: unknown; from?: unknown; body?: unknown;
  title?: unknown; start?: unknown; end?: unknown; file_id?: unknown; channel?: unknown; text?: unknown;
}
type Executor = (args: Args, ctx: ToolContext, token: string) => Promise<unknown>;

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : v == null ? fallback : String(v));
const num = (v: unknown, fallback: number, max: number) => Math.min(Math.max(Number(v) || fallback, 1), max);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(url: string, token: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body && typeof init.body === "string" ? { "content-type": "application/json" } : {}), ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** "+02:00"-style offset of a time zone at a given local date-time (approximate around DST changes). */
function offsetFor(tz: string | undefined, local: string): string {
  try {
    const d = new Date(local + "Z");
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d);
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second"));
    const mins = Math.round((asUtc - d.getTime()) / 60000);
    const sign = mins < 0 ? "-" : "+";
    const a = Math.abs(mins);
    return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
  } catch {
    return "Z";
  }
}

/** Accepts "2026-10-26" or "2026-10-26T09:00:00" (with or without offset) and returns RFC 3339. */
function rfc3339(value: string, tz: string | undefined, endOfDay = false): string {
  let v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v += endOfDay ? "T23:59:59" : "T00:00:00";
  if (/(Z|[+-]\d{2}:\d{2})$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) v += ":00";
  return v + offsetFor(tz, v);
}

const utf8b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin);
};
const b64url = (s: string) => utf8b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const EXECUTORS: Record<string, Executor> = {
  async gmail_search(a, _c, token) {
    const list = await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: str(a.query), maxResults: String(num(a.limit, 5, 10)) })}`, token);
    const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
    return Promise.all(ids.map(async (id) => {
      const m = await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, token);
      const h = (n: string) => (m.payload?.headers ?? []).find((x: { name: string }) => x.name.toLowerCase() === n)?.value;
      return { id, from: h("from"), subject: h("subject"), date: h("date"), snippet: m.snippet };
    }));
  },
  async gmail_draft(a, _c, token) {
    const subject = /^[\x20-\x7e]*$/.test(str(a.subject)) ? str(a.subject) : `=?UTF-8?B?${utf8b64(str(a.subject))}?=`;
    const raw = `To: ${str(a.to).replace(/[\r\n]/g, "")}\r\nSubject: ${subject.replace(/[\r\n]/g, "")}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${str(a.body)}`;
    const d = await api("https://gmail.googleapis.com/gmail/v1/users/me/drafts", token, { method: "POST", body: JSON.stringify({ message: { raw: b64url(raw) } }) });
    return { ok: true, draft_id: d.id, note: "Draft saved in Gmail. It has NOT been sent." };
  },
  async gcal_list_events(a, c, token) {
    const q = new URLSearchParams({ timeMin: rfc3339(str(a.from), c.timezone), timeMax: rfc3339(str(a.to), c.timezone, true), singleEvents: "true", orderBy: "startTime", maxResults: "25" });
    const r = await api(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, token);
    return (r.items ?? []).map((e: any) => ({ id: e.id, title: e.summary, start: e.start?.dateTime ?? e.start?.date, end: e.end?.dateTime ?? e.end?.date, location: e.location }));
  },
  async gcal_create_event(a, c, token) {
    const tz = c.timezone ?? "UTC";
    const part = (v: string) => (/(Z|[+-]\d{2}:\d{2})$/.test(v) ? { dateTime: v } : { dateTime: v, timeZone: tz });
    const e = await api("https://www.googleapis.com/calendar/v3/calendars/primary/events", token, { method: "POST", body: JSON.stringify({ summary: str(a.title), start: part(str(a.start)), end: part(str(a.end)) }) });
    return { ok: true, id: e.id, link: e.htmlLink };
  },
  async gdrive_search(a, _c, token) {
    const term = str(a.query).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const q = new URLSearchParams({ q: `fullText contains '${term}' and trashed=false`, pageSize: "10", fields: "files(id,name,mimeType,modifiedTime,webViewLink)" });
    return (await api(`https://www.googleapis.com/drive/v3/files?${q}`, token)).files ?? [];
  },
  async gdrive_read(a, _c, token) {
    const id = encodeURIComponent(str(a.file_id));
    const meta = await api(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType`, token);
    const url = String(meta.mimeType).startsWith("application/vnd.google-apps.")
      ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`
      : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
    if (!String(meta.mimeType).startsWith("application/vnd.google-apps.") && !String(meta.mimeType).startsWith("text/")) return { name: meta.name, error: "Only Google Docs/Sheets/Slides and plain-text files can be read." };
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Couldn't read the file (${res.status}).`);
    return { name: meta.name, content: (await res.text()).slice(0, 20000) };
  },
  async slack_search(a, _c, token) {
    const r = await api(`https://slack.com/api/search.messages?${new URLSearchParams({ query: str(a.query), count: "10" })}`, token);
    if (!r.ok) throw new Error(`Slack error: ${r.error}`);
    return (r.messages?.matches ?? []).map((m: any) => ({ channel: m.channel?.name, user: m.username, text: m.text, ts: m.ts, link: m.permalink }));
  },
  async slack_post(a, _c, token) {
    const r = await api("https://slack.com/api/chat.postMessage", token, { method: "POST", body: JSON.stringify({ channel: str(a.channel).replace(/^#/, ""), text: str(a.text) }) });
    if (!r.ok) throw new Error(`Slack error: ${r.error}`);
    return { ok: true, ts: r.ts, channel: r.channel };
  },
};

const OWNER: Record<string, string> = {};
for (const p of PLUGINS) for (const t of p.tools) OWNER[t.name] = p.id;

/** Tools the model may call right now: implemented AND connected for this user. */
export async function availableTools(uid: string, requested: string[]): Promise<{ tools: PluginTool[]; live: string[]; notLive: string[] }> {
  const tools: PluginTool[] = [];
  const live: string[] = [];
  const notLive: string[] = [];
  for (const id of requested) {
    const plugin = PLUGINS.find((p) => p.id === id);
    if (!plugin) continue;
    if (PLUGIN_PROVIDER[id] && (await loadToken(uid, id))) {
      live.push(plugin.name);
      tools.push(...plugin.tools.filter((t) => EXECUTORS[t.name]));
    } else notLive.push(plugin.name);
  }
  return { tools, live, notLive };
}

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<unknown> {
  const exec = EXECUTORS[name];
  const plugin = OWNER[name];
  if (!exec || !plugin) return { error: `Unknown tool ${name}.` };
  try {
    const args = rawArgs ? (JSON.parse(rawArgs) as Args) : {};
    return await exec(args, ctx, await accessToken(ctx.uid, plugin));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tool failed." };
  }
}
