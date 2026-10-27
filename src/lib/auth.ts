export interface AuthResult { user: { email: string } | null; persistent?: boolean; requireLogin?: boolean; providers?: { google: boolean; apple: boolean } }

async function call(path: string, body?: unknown): Promise<AuthResult> {
  const init: RequestInit = body === undefined ? { method: "GET" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(path, init);
  const j = (await res.json().catch(() => ({}))) as AuthResult & { error?: string };
  if (!res.ok) throw new Error(j.error ?? "Something went wrong. Try again.");
  return j;
}

export const fetchMe = () => call("/api/auth/me");
export const register = (email: string, password: string) => call("/api/auth/register", { email, password });
export const login = (email: string, password: string) => call("/api/auth/login", { email, password });
export const logout = () => call("/api/auth/logout", {});
