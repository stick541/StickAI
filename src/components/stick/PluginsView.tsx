import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PLUGINS, PLUGIN_CATEGORIES, type Plugin } from "@/lib/plugins";
import { useStore } from "@/lib/store";

type Status = Record<string, { configured: boolean; connected: boolean }>;

function Logo({ p, size = "size-12" }: { p: Plugin; size?: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-white p-2 ring-1 ring-black/5`}>
      <img src={p.logo} alt="" className="size-full object-contain" />
    </span>
  );
}

/** Connect / disconnect logic shared by the cards and the detail dialog. */
function usePluginActions() {
  const { plugins, setPlugin } = useStore();
  const [status, setStatus] = useState<Status>({});

  useEffect(() => {
    fetch("/api/plugins/status")
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : null))
      .then((st) => {
        if (!st) return;
        setStatus(st);
        // The server is the source of truth for plugins with a real connection.
        for (const [id, v] of Object.entries(st)) setPlugin(id, v.connected);
      })
      .catch(() => {});
  }, [setPlugin]);

  const isOn = (p: Plugin) => plugins.includes(p.id);
  const live = (p: Plugin) => !!p.oauth && !!status[p.id]?.configured;

  const connect = (p: Plugin) => {
    if (p.oauth) {
      if (!status[p.id]) { toast("Can't reach the server to connect plugins. Start the app with `npm run dev` and try again."); return; }
      if (!status[p.id].configured) { toast(`${p.name} needs server setup first: add the ${p.oauth === "google" ? "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" : "SLACK_CLIENT_ID and SLACK_CLIENT_SECRET"} environment variables (see README).`); return; }
      window.location.href = `/api/oauth/${p.oauth}/start?plugin=${encodeURIComponent(p.id)}`;
      return;
    }
    setPlugin(p.id, true);
    toast(`${p.name} enabled in preview. A live connection isn't available for it yet.`);
  };

  const disconnect = async (p: Plugin) => {
    if (p.oauth && status[p.id]?.connected) {
      try {
        const r = await fetch("/api/plugins/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plugin: p.id }) });
        if (!r.ok) throw new Error();
        setStatus((s) => ({ ...s, [p.id]: { ...s[p.id], connected: false } }));
      } catch { toast(`Couldn't disconnect ${p.name}. Try again.`); return; }
    }
    setPlugin(p.id, false);
    toast(`${p.name} disconnected.`);
  };

  return { isOn, live, connect, disconnect };
}

function PluginDialog({ plugin, onClose, actions }: { plugin: Plugin | null; onClose: () => void; actions: ReturnType<typeof usePluginActions> }) {
  const newChat = useStore((s) => s.newChat);
  if (!plugin) return null;
  const on = actions.isOn(plugin);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="shadow-menu sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Logo p={plugin} />
            <div>
              <DialogTitle>{plugin.name}</DialogTitle>
              <DialogDescription>{plugin.tagline}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <p className="text-sm">{plugin.description}</p>
        <p className="text-xs text-muted-foreground">{plugin.oauth ? "Live connection: Stick uses your real account once you sign in." : "Preview only: a live connection for this plugin isn't available yet."}</p>
        <div>
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">Try asking</h4>
          <ul className="space-y-1.5 text-sm">{plugin.examples.map((e) => <li key={e} className="rounded-lg bg-card px-3 py-2">“{e}”</li>)}</ul>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">What Stick can do with it</h4>
          <ul className="space-y-1 text-sm">{plugin.tools.map((t) => <li key={t.name} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{t.description}</li>)}</ul>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => (on ? actions.disconnect(plugin) : actions.connect(plugin))}
            className={`flex-1 rounded-full py-2 text-sm font-medium ${on ? "border hover:bg-accent" : "bg-primary text-primary-foreground hover:bg-primary-hover"}`}
          >{on ? "Disconnect" : "Connect"}</button>
          {on && <button onClick={() => { newChat(); onClose(); }} className="flex-1 rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover">Start a chat</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PluginsView() {
  const connectedCount = useStore((s) => s.plugins.length);
  const actions = usePluginActions();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [open, setOpen] = useState<Plugin | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return PLUGINS.filter((p) => (cat === "All" || p.category === cat) && (!s || p.name.toLowerCase().includes(s) || p.tagline.toLowerCase().includes(s) || p.description.toLowerCase().includes(s)));
  }, [q, cat]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 pb-12 pt-4 animate-fade-up">
        <h1 className="text-2xl font-semibold tracking-tight">Plugins</h1>
        <p className="mt-1 text-sm text-muted-foreground">Connect Stick to the tools you use every day. {connectedCount > 0 && `${connectedCount} connected.`}</p>

        <div className="mt-5 flex items-center gap-2 rounded-full bg-card px-4 shadow-composer focus-within:ring-2 focus-within:ring-primary/70">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plugins" aria-label="Search plugins" className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Plugin categories">
          {PLUGIN_CATEGORIES.map((c) => (
            <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`rounded-full px-3 py-1.5 text-sm transition-colors ${cat === c ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>{c}</button>
          ))}
        </div>

        {list.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">No plugins match “{q}”.</p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {list.map((p) => {
              const on = actions.isOn(p);
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-2xl border bg-card/50 p-3 transition-colors hover:bg-card">
                  <button onClick={() => setOpen(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`${p.name} details`}>
                    <Logo p={p} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{p.tagline}{!p.oauth && " · Preview"}</span>
                    </span>
                  </button>
                  <button
                    onClick={() => (on ? actions.disconnect(p) : actions.connect(p))}
                    aria-pressed={on}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${on ? "border text-muted-foreground hover:bg-accent" : "bg-primary text-primary-foreground hover:bg-primary-hover"}`}
                  >{on ? "Connected" : "Connect"}</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <PluginDialog plugin={open} onClose={() => setOpen(null)} actions={actions} />
    </div>
  );
}
