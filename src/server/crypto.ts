const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64u(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64u(s: string) {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(p);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const randomId = (bytes = 16) => b64u(crypto.getRandomValues(new Uint8Array(bytes)));

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function sign(secret: string, data: string): Promise<string> {
  return b64u(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data)));
}

export async function verifySig(secret: string, data: string, sig: string): Promise<boolean> {
  return timingSafeEqual(await sign(secret, data), sig);
}

/** PBKDF2-SHA256 (100k iterations is the maximum Cloudflare Workers allow). */
export async function hashPassword(password: string, salt: string = randomId(16)): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64u(salt), iterations: 100000 }, key, 256);
  return `${salt}.${b64u(bits)}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const salt = stored.split(".")[0];
  if (!salt) return false;
  return timingSafeEqual(await hashPassword(password, salt), stored);
}

async function aesKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode("stick-token-key:" + secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypts a JSON-serialisable value for storage at rest (used for OAuth tokens). */
export async function encryptJson(secret: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), enc.encode(JSON.stringify(value)));
  return `${b64u(iv)}.${b64u(ct)}`;
}

export async function decryptJson<T>(secret: string, blob: string): Promise<T | null> {
  try {
    const [iv, ct] = blob.split(".");
    if (!iv || !ct) return null;
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, await aesKey(secret), unb64u(ct));
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    return null;
  }
}
