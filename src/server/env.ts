/** Read a server environment variable (works on Node and on Cloudflare via nodejs_compat). */
export function env(key: string): string | undefined {
  try {
    const v = typeof process !== "undefined" ? process.env?.[key] : undefined;
    return v && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}
