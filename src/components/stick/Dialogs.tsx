import { useEffect, useMemo, useState } from "react";
import { Check, MessageSquare, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore, type Accent, type Theme } from "@/lib/store";
import { login, logout, register } from "@/lib/auth";
import { pushNow, syncAfterLogin } from "@/lib/sync";
import { toast } from "sonner";

type P = { open: boolean; onOpenChange: (o: boolean) => void };
const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/60";

export function SearchDialog({ open, onOpenChange }: P) {
  const { conversations, setActive } = useStore();
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const results = useMemo(() => {
    const s = q.toLowerCase();
    return conversations.filter((c) => !s || c.title.toLowerCase().includes(s) || c.messages.some((m) => m.content.toLowerCase().includes(s))).slice(0, 20);
  }, [q, conversations]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 shadow-menu sm:max-w-lg">
        <DialogTitle className="sr-only">Search chats</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats…" aria-label="Search chats" className="h-12 flex-1 bg-transparent text-sm outline-none" />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{conversations.length ? "No matching chats." : "No chats yet — start one!"}</p>}
          {results.map((c) => (
            <button key={c.id} onClick={() => { setActive(c.id); onOpenChange(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent">
              <MessageSquare className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{c.title}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function UpgradeDialog({ open, onOpenChange }: P) {
  const plans = [
    { name: "Free", price: "$0", perks: ["Stick, Stick 1 and Stick 1.1", "Standard voice", "Limited image uploads"], current: true },
    { name: "Plus", price: "$20", perks: ["Stick 2, 2.1 and Stick Build", "Extended Think mode", "Priority speed", "More uploads"] },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="shadow-menu sm:max-w-xl">
        <DialogHeader><DialogTitle>Upgrade your plan</DialogTitle><DialogDescription>Get more out of StickAI.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((p) => (
            <div key={p.name} className={`rounded-xl border p-4 ${p.current ? "" : "border-primary/60 bg-primary/5"}`}>
              <div className="font-semibold">{p.name}</div>
              <div className="mt-1 text-2xl font-bold">{p.price}<span className="text-sm font-normal text-muted-foreground"> /month</span></div>
              <ul className="mt-3 space-y-1.5 text-sm">{p.perks.map((x) => <li key={x} className="flex gap-2"><Check className="size-4 text-primary" />{x}</li>)}</ul>
              <button
                disabled={p.current}
                onClick={() => { toast("Plus checkout isn't connected yet — we'll let you know when it's live."); onOpenChange(false); }}
                className="mt-4 w-full rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:bg-muted disabled:text-muted-foreground"
              >{p.current ? "Your current plan" : "Get Plus"}</button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountPanel() {
  const { user, setUser, resetLocal } = useStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const r = await (mode === "login" ? login : register)(email, password);
      setUser(r.user);
      await syncAfterLogin();
      setPassword("");
      toast(mode === "login" ? "Signed in. Your chats are syncing." : "Account created. Your chats are syncing.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true);
    try { await pushNow(); await logout(); resetLocal(); setUser(null); toast("Signed out."); } catch { toast("Couldn't sign out. Try again."); } finally { setBusy(false); }
  };
  if (user)
    return (
      <div className="space-y-4">
        <div><div className="text-sm text-muted-foreground">Signed in as</div><div className="font-medium">{user.email}</div></div>
        <p className="text-sm text-muted-foreground">Your chats and projects sync across your devices (text only — attached images stay on the device).</p>
        <button disabled={busy} onClick={signOut} className="rounded-full border px-4 py-1.5 text-sm hover:bg-accent disabled:opacity-50">Sign out</button>
      </div>
    );
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className="text-sm text-muted-foreground">{mode === "login" ? "Sign in to sync your chats and plugins across devices." : "Create an account to sync your chats and plugins across devices."}</p>
      <div><label htmlFor="acc-email" className="mb-1 block text-sm">Email</label><input id="acc-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} required /></div>
      <div><label htmlFor="acc-pw" className="mb-1 block text-sm">Password</label><input id="acc-pw" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} className={field} required /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">{mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} className="text-sm text-muted-foreground underline-offset-2 hover:underline">{mode === "login" ? "Create an account" : "I already have an account"}</button>
      </div>
    </form>
  );
}

export function SettingsDialog({ open, onOpenChange, tab }: P & { tab?: string }) {
  const [current, setCurrent] = useState("general");
  useEffect(() => { if (open) setCurrent(tab ?? "general"); }, [open, tab]);
  const { settings, setSettings, conversations, clearAll } = useStore();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load(); speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  const exportChats = () => {
    const blob = new Blob([JSON.stringify(conversations, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "stickai-chats.json"; a.click();
  };
  const accents: { id: Accent; label: string; cls: string }[] = [
    { id: "emerald", label: "Emerald", cls: "bg-[oklch(0.69_0.11_160)]" },
    { id: "blue", label: "Blue", cls: "bg-[oklch(0.66_0.15_262)]" },
    { id: "slate", label: "Slate", cls: "bg-[oklch(0.66_0.012_250)]" },
  ];
  const row = "flex items-center justify-between gap-4 border-b py-3 last:border-0";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="shadow-menu sm:max-w-2xl">
        <DialogHeader><DialogTitle>Settings</DialogTitle><DialogDescription className="sr-only">Manage StickAI preferences</DialogDescription></DialogHeader>
        <Tabs value={current} onValueChange={setCurrent}>
          <TabsList className="flex-wrap"><TabsTrigger value="general">General</TabsTrigger><TabsTrigger value="account">Account</TabsTrigger><TabsTrigger value="personal">Personalization</TabsTrigger><TabsTrigger value="voice">Voice</TabsTrigger><TabsTrigger value="data">Data controls</TabsTrigger></TabsList>
          <TabsContent value="general" className="mt-2">
            <div className={row}><label htmlFor="theme" className="text-sm">Theme</label>
              <select id="theme" value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value as Theme })} className={`${field} w-40`}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></div>
            <div className={row}><span className="text-sm">Accent color</span>
              <div className="flex gap-2">{accents.map((a) => (
                <button key={a.id} aria-label={a.label} aria-pressed={settings.accent === a.id} onClick={() => setSettings({ accent: a.id })} className={`flex size-7 items-center justify-center rounded-full ${a.cls} ${settings.accent === a.id ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`} />
              ))}</div></div>
            <div className={row}><label htmlFor="lang" className="text-sm">Language</label>
              <select id="lang" value={settings.language} onChange={(e) => setSettings({ language: e.target.value })} className={`${field} w-40`}>{["English", "Español", "Français", "Deutsch", "Português", "日本語"].map((l) => <option key={l}>{l}</option>)}</select></div>
          </TabsContent>
          <TabsContent value="account" className="mt-4"><AccountPanel /></TabsContent>
          <TabsContent value="personal" className="mt-2 space-y-4">
            <div><label htmlFor="nick" className="mb-1 block text-sm">What should Stick call you?</label><input id="nick" value={settings.nickname} onChange={(e) => setSettings({ nickname: e.target.value })} className={field} /></div>
            <div><label htmlFor="ins" className="mb-1 block text-sm">Custom instructions</label><textarea id="ins" rows={4} value={settings.instructions} onChange={(e) => setSettings({ instructions: e.target.value })} placeholder="e.g. Keep answers short and use bullet points." className={field} /></div>
          </TabsContent>
          <TabsContent value="voice" className="mt-2">
            <div className={row}><label htmlFor="voice" className="text-sm">Read-aloud voice</label>
              <select id="voice" value={settings.voice} onChange={(e) => setSettings({ voice: e.target.value })} className={`${field} w-56`}>
                <option value="">System default</option>{voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select></div>
          </TabsContent>
          <TabsContent value="data" className="mt-2">
            <div className={row}><span className="text-sm">Export your chats</span><button onClick={exportChats} className="rounded-full border px-4 py-1.5 text-sm hover:bg-accent">Export</button></div>
            <div className={row}><span className="text-sm">Delete all chats</span>
              <button onClick={() => { if (confirm("Delete all chats? This can't be undone.")) { clearAll(); toast("All chats deleted."); } }} className="rounded-full border border-destructive/50 px-4 py-1.5 text-sm text-destructive hover:bg-destructive/10">Delete all</button></div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
