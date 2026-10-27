import { env } from "./env";

/**
 * Tiny key-value store used for users, sessions-adjacent data, OAuth tokens and synced chats.
 *
 *  - Default: in-memory (fine for local dev; data is lost on restart and is NOT shared
 *    between serverless instances).
 *  - Production: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (free tier at
 *    upstash.com). It uses plain fetch(), so it works on Node and Cloudflare Workers.
 */
export interface KV {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  readonly persistent: boolean;
}

const g = globalThis as unknown as { __stickMem?: Map<string, { v: string; exp?: number }> };

const memory: KV = {
  persistent: false,
  async get<T>(key: string) {
    const mem = (g.__stickMem ??= new Map());
    const hit = mem.get(key);
    if (!hit) return null;
    if (hit.exp && hit.exp < Date.now()) { mem.delete(key); return null; }
    return JSON.parse(hit.v) as T;
  },
  async set(key, value, ttl) {
    (g.__stickMem ??= new Map()).set(key, ttl ? { v: JSON.stringify(value), exp: Date.now() + ttl * 1000 } : { v: JSON.stringify(value) });
  },
  async del(key) { (g.__stickMem ??= new Map()).delete(key); },
};

function upstash(url: string, token: string): KV {
  const cmd = async (args: (string | number)[]) => {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`Storage error (${res.status})`);
    return ((await res.json()) as { result: unknown }).result;
  };
  return {
    persistent: true,
    async get<T>(key: string) {
      const r = await cmd(["GET", key]);
      return typeof r === "string" ? (JSON.parse(r) as T) : null;
    },
    async set(key, value, ttl) {
      const s = JSON.stringify(value);
      await cmd(ttl ? ["SET", key, s, "EX", ttl] : ["SET", key, s]);
    },
    async del(key) { await cmd(["DEL", key]); },
  };
}

export function kv(): KV {
  const url = env("UPSTASH_REDIS_REST_URL");
  const token = env("UPSTASH_REDIS_REST_TOKEN");
  return url && token ? upstash(url, token) : memory;
}
