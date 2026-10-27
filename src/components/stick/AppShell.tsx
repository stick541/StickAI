import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { fetchMe, login, register } from "@/lib/auth";
import { syncAfterLogin } from "@/lib/sync";
import { BRAND, DESCRIPTION, TAGLINE } from "@/lib/site";
import { ChatApp } from "./ChatApp";

interface Providers { google: boolean; apple: boolean }
interface Gate { loading: boolean; requireLogin: boolean; persistent: boolean; providers: Providers }
const NONE: Providers = { google: false, apple: false };

/** Decides between the sign-in screen and the chat. */
export function AppShell() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const [gate, setGate] = useState<Gate>({ loading: true, requireLogin: false, persistent: true, providers: NONE });
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    // Always ask the server who is signed in; never trust what was saved in the browser.
    fetchMe()
      .then((r) => { setUser(r.user); setGate({ loading: false, requireLogin: r.requireLogin !== false, persistent: r.persistent !== false, providers: r.providers ?? NONE }); })
      .catch(() => { setGate({ loading: false, requireLogin: false, persistent: true, providers: NONE }); }); // no server (e.g. static preview): run locally
  }, [setUser]);

  if (gate.loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background" role="status" aria-label="Loading">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (gate.requireLogin && !user) return <AuthScreen persistent={gate.persistent} providers={gate.providers} />;
  return guest || user || !gate.requireLogin ? <ChatApp /> : null;
}

function AuthScreen({ persistent, providers }: { persistent: boolean; providers: Providers }) {
  const setUser = useStore((s) => s.setUser);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A failed Google/Apple sign-in sends the person back here with ?auth_error=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const e = params.get("auth_error");
    if (e) { setError(e); history.replaceState(null, "", location.pathname); }
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await (mode === "login" ? login : register)(email, password);
      setUser(r.user);
      await syncAfterLogin().catch(() => {});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/60";
  const tab = (m: typeof mode) => `flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${mode === m ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/stick-logo.png" alt="" width={56} height={56} className="mb-4 size-14 rounded-2xl" />
          <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? `Welcome back to ${BRAND}` : `Create your ${BRAND} account`}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{mode === "login" ? "Sign in to keep chatting." : DESCRIPTION}</p>
        </div>

        <div className="mb-4 flex gap-1 rounded-xl bg-card p-1" role="tablist" aria-label="Sign in or create an account">
          <button type="button" role="tab" aria-selected={mode === "login"} className={tab("login")} onClick={() => { setMode("login"); setError(""); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={tab("register")} onClick={() => { setMode("register"); setError(""); }}>Create account</button>
        </div>

        {(providers.google || providers.apple) && (
          <div className="mb-4 space-y-2">
            {providers.google && <a href="/api/auth/google/start" className="flex w-full items-center justify-center rounded-xl border bg-card py-3 text-sm font-medium hover:bg-accent">Continue with Google</a>}
            {providers.apple && <a href="/api/auth/apple/start" className="flex w-full items-center justify-center rounded-xl bg-white py-3 text-sm font-medium text-black hover:bg-white/90">Continue with Apple</a>}
            <div className="flex items-center gap-3 py-2 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or use email<span className="h-px flex-1 bg-border" /></div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="auth-email" className="mb-1 block text-sm">Email</label>
            <input id="auth-email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="auth-pw" className="mb-1 block text-sm">Password</label>
            <div className="relative">
              <input id="auth-pw" type={show ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} pr-12`} />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {mode === "register" && <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>}
          </div>
          {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">{error}</p>}
          {!persistent && <p className="rounded-xl border px-4 py-3 text-xs text-muted-foreground">Heads up: this server isn't saving accounts permanently yet, so your account may disappear when it restarts.</p>}
          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />}{mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-muted-foreground">{BRAND} · {TAGLINE}</p>
      </div>
    </main>
  );
}
