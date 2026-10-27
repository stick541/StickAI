import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Download, FolderPlus, Keyboard, Loader2, Plus, Settings, Sparkles, Trash2, UserRound, Wand2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useStore, uid } from "@/lib/store";
import { describeSchedule } from "@/lib/scheduler";

const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/60";
const primaryBtn = "rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50";

function Page({ title, text, action, children }: { title: string; text: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 pb-12 pt-4 animate-fade-up">
        <div className="flex items-start justify-between gap-4">
          <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>
          {action}
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="mt-16 text-center text-sm text-muted-foreground">{children}</p>;

/* ------------------------------ Library ------------------------------ */

export function LibraryView() {
  const { conversations, images, setActive } = useStore();
  const attached = useMemo(
    () => conversations.flatMap((c) => c.messages.flatMap((m) => (m.images ?? []).map((src, i) => ({ key: `${m.id}-${i}`, src, cid: c.id, title: c.title })))),
    [conversations],
  );
  const total = attached.length + images.length;
  return (
    <Page title="Library" text="Images you shared in chats and images you created.">
      {total === 0 ? (
        <Empty>Nothing here yet. Attach an image in a chat or create one in Images.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((i) => (
            <a key={i.id} href={i.src} download={`stick-${i.id}.png`} title={i.prompt} className="group relative aspect-square overflow-hidden rounded-xl bg-card">
              <img src={i.src} alt={i.prompt} className="size-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100">Created · {i.prompt}</span>
            </a>
          ))}
          {attached.map((a) => (
            <button key={a.key} onClick={() => setActive(a.cid)} title={a.title} className="group relative aspect-square overflow-hidden rounded-xl bg-card">
              <img src={a.src} alt={`From chat: ${a.title}`} className="size-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-left text-xs text-white opacity-0 group-hover:opacity-100">{a.title}</span>
            </button>
          ))}
        </div>
      )}
    </Page>
  );
}

/* ------------------------------ Images ------------------------------ */

export function ImagesView() {
  const { images, addImage, removeImage } = useStore();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/images", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
      const j = (await res.json().catch(() => ({}))) as { src?: string; error?: string };
      if (res.status === 501 || res.status === 404) throw new Error("Image creation isn't set up on the server yet. Add STICK_API_URL (and an image model) to the server settings — see the README.");
      if (!res.ok || !j.src) throw new Error(j.error ?? "Couldn't create the image. Try again.");
      addImage({ id: uid(), prompt: prompt.trim(), src: j.src, createdAt: Date.now() });
      setPrompt("");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Page title="Images" text="Describe an image and Stick will create it.">
      <div className="rounded-2xl bg-card p-3 shadow-composer focus-within:ring-2 focus-within:ring-primary/70">
        <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); } }} placeholder="A cozy cabin in a snowy forest at dusk…" aria-label="Image description" className="block w-full resize-none bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground" />
        <div className="mt-2 flex justify-end"><button onClick={generate} disabled={busy || !prompt.trim()} className={`${primaryBtn} flex items-center gap-2`}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}{busy ? "Creating…" : "Create"}</button></div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">{error}</p>}
      {images.length === 0 ? (
        <Empty>Your creations will appear here.</Empty>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
          {images.map((i) => (
            <figure key={i.id} className="group relative overflow-hidden rounded-xl bg-card">
              <img src={i.src} alt={i.prompt} className="aspect-square w-full object-cover" />
              <figcaption className="truncate px-3 py-2 text-xs text-muted-foreground">{i.prompt}</figcaption>
              <div className="absolute right-2 top-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                <a href={i.src} download={`stick-${i.id}.png`} aria-label="Download image" className="rounded-full bg-black/60 p-2 text-white"><Download className="size-4" /></a>
                <button onClick={() => removeImage(i.id)} aria-label="Delete image" className="rounded-full bg-black/60 p-2 text-white"><Trash2 className="size-4" /></button>
              </div>
            </figure>
          ))}
        </div>
      )}
    </Page>
  );
}

/* ------------------------------ Scheduled ------------------------------ */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ScheduledView() {
  const { scheduled, addTask, patchTask, removeTask, setActive } = useStore();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<"once" | "daily" | "weekly">("daily");
  const [time, setTime] = useState("09:00");
  const [date, setDate] = useState("");
  const [weekday, setWeekday] = useState(1);

  const save = () => {
    if (!prompt.trim()) { toast("Write what Stick should do."); return; }
    if (kind === "once") {
      if (!date || new Date(`${date}T${time}`).getTime() <= Date.now()) { toast("Pick a date and time in the future."); return; }
    }
    addTask({ title: title.trim() || prompt.trim().slice(0, 40), prompt: prompt.trim(), kind, time, date: kind === "once" ? date : undefined, weekday: kind === "weekly" ? weekday : undefined });
    setAdding(false); setTitle(""); setPrompt("");
  };
  const fmt = (t: number | null) => (t ? new Date(t).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

  return (
    <Page
      title="Scheduled"
      text="Ask Stick to do something later or on repeat. Tasks run while StickAI is open in a browser tab."
      action={!adding && <button onClick={() => setAdding(true)} className={`${primaryBtn} flex shrink-0 items-center gap-1.5`}><Plus className="size-4" />New task</button>}
    >
      {adding && (
        <div className="space-y-3 rounded-2xl border bg-card/50 p-4">
          <div><label htmlFor="t-title" className="mb-1 block text-sm">Name (optional)</label><input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="Morning briefing" /></div>
          <div><label htmlFor="t-prompt" className="mb-1 block text-sm">What should Stick do?</label><textarea id="t-prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} className={field} placeholder="Give me three things to focus on today." /></div>
          <div className="flex flex-wrap items-end gap-3">
            <div><label htmlFor="t-kind" className="mb-1 block text-sm">Repeat</label><select id="t-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={`${field} w-36`}><option value="once">Once</option><option value="daily">Every day</option><option value="weekly">Every week</option></select></div>
            {kind === "once" && <div><label htmlFor="t-date" className="mb-1 block text-sm">Date</label><input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} w-40`} /></div>}
            {kind === "weekly" && <div><label htmlFor="t-day" className="mb-1 block text-sm">Day</label><select id="t-day" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={`${field} w-40`}>{DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></div>}
            <div><label htmlFor="t-time" className="mb-1 block text-sm">Time</label><input id="t-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${field} w-32`} /></div>
          </div>
          <div className="flex gap-2 pt-1"><button onClick={save} className={primaryBtn}>Schedule</button><button onClick={() => setAdding(false)} className="rounded-full border px-5 py-2 text-sm hover:bg-accent">Cancel</button></div>
        </div>
      )}
      {scheduled.length === 0 && !adding ? (
        <Empty>No scheduled tasks yet.</Empty>
      ) : (
        <ul className="mt-4 space-y-2">
          {scheduled.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-2xl border bg-card/50 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{t.title}</div>
                <div className="truncate text-sm text-muted-foreground">{describeSchedule(t)} · {t.enabled && t.nextRunAt ? `next ${fmt(t.nextRunAt)}` : "finished"}</div>
                {t.lastRunAt && <div className="text-xs text-muted-foreground">Last ran {fmt(t.lastRunAt)}</div>}
              </div>
              {t.kind !== "once" || t.enabled ? (
                <button onClick={() => patchTask(t.id, { enabled: !t.enabled })} aria-pressed={t.enabled} className={`rounded-full px-4 py-1.5 text-sm ${t.enabled ? "bg-primary/15 text-primary" : "border text-muted-foreground"}`}>{t.enabled ? "On" : "Off"}</button>
              ) : null}
              <button onClick={() => removeTask(t.id)} aria-label={`Delete ${t.title}`} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {scheduled.some((t) => t.lastRunAt) && <button onClick={() => { const c = useStore.getState().conversations[0]; if (c) setActive(c.id); }} className="mt-4 text-sm text-muted-foreground underline-offset-2 hover:underline">Open latest chat</button>}
    </Page>
  );
}

/* ------------------------------ Projects ------------------------------ */

export function ProjectsView() {
  const { projects, activeProject, setActiveProject, addProject, updateProject, removeProject, conversations, setActive, newChat } = useStore();
  const [name, setName] = useState("");
  const project = projects.find((p) => p.id === activeProject);

  if (project) {
    const chats = conversations.filter((c) => c.projectId === project.id).sort((a, b) => b.updatedAt - a.updatedAt);
    return (
      <Page title={project.name} text="Chats in this project follow its instructions.">
        <button onClick={() => setActiveProject(null)} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All projects</button>
        <div className="space-y-4">
          <div><label htmlFor="p-name" className="mb-1 block text-sm">Name</label><input id="p-name" value={project.name} onChange={(e) => updateProject(project.id, { name: e.target.value })} className={field} /></div>
          <div><label htmlFor="p-ins" className="mb-1 block text-sm">Instructions</label><textarea id="p-ins" rows={5} value={project.instructions} onChange={(e) => updateProject(project.id, { instructions: e.target.value })} placeholder="e.g. You are helping me write my novel. Keep a warm, literary tone." className={field} /></div>
          <div className="flex gap-2">
            <button onClick={() => { const id = project.id; newChat(); setActiveProject(id); }} className={`${primaryBtn} flex items-center gap-1.5`}><MessageSquare className="size-4" />New chat in project</button>
            <button onClick={() => { if (confirm(`Delete "${project.name}"? Its chats are kept.`)) removeProject(project.id); }} className="rounded-full border border-destructive/50 px-5 py-2 text-sm text-destructive hover:bg-destructive/10">Delete project</button>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Chats</h2>
            {chats.length === 0 ? <p className="text-sm text-muted-foreground">No chats in this project yet.</p> : (
              <ul className="space-y-1">{chats.map((c) => <li key={c.id}><button onClick={() => setActive(c.id)} className="w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-accent">{c.title}</button></li>)}</ul>
            )}
          </div>
        </div>
      </Page>
    );
  }

  const create = () => { if (name.trim()) { addProject(name); setName(""); } };
  return (
    <Page title="Projects" text="Group related chats under shared instructions.">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="New project name" aria-label="New project name" className={field} />
        <button onClick={create} disabled={!name.trim()} className={`${primaryBtn} flex shrink-0 items-center gap-1.5`}><FolderPlus className="size-4" />Create</button>
      </div>
      {projects.length === 0 ? <Empty>No projects yet.</Empty> : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <button key={p.id} onClick={() => setActiveProject(p.id)} className="rounded-2xl border bg-card/50 p-4 text-left transition-colors hover:bg-card">
              <div className="truncate font-medium">{p.name}</div>
              <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.instructions || "No instructions yet"}</div>
              <div className="mt-2 text-xs text-muted-foreground">{conversations.filter((c) => c.projectId === p.id).length} chats</div>
            </button>
          ))}
        </div>
      )}
    </Page>
  );
}

/* ------------------------------ More ------------------------------ */

export function MoreView({ onSettings, onUpgrade }: { onSettings: (tab?: string) => void; onUpgrade: () => void }) {
  const { user, conversations } = useStore();
  const exportChats = () => {
    const blob = new Blob([JSON.stringify(conversations, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "stickai-chats.json"; a.click();
  };
  const row = "flex w-full items-center gap-3 rounded-xl border bg-card/50 px-4 py-3 text-left text-sm hover:bg-card";
  return (
    <Page title="More" text="Account, data and shortcuts.">
      <div className="max-w-xl space-y-2">
        <button className={row} onClick={() => onSettings("account")}><UserRound className="size-5 text-primary" /><span className="flex-1">{user ? `Account (${user.email})` : "Sign in or create an account"}</span></button>
        <button className={row} onClick={() => onSettings()}><Settings className="size-5 text-primary" /><span className="flex-1">Settings</span></button>
        <button className={row} onClick={onUpgrade}><Sparkles className="size-5 text-primary" /><span className="flex-1">Plans</span></button>
        <button className={row} onClick={exportChats}><Download className="size-5 text-primary" /><span className="flex-1">Export your chats</span></button>
        <div className="rounded-xl border bg-card/50 px-4 py-3 text-sm">
          <div className="mb-2 flex items-center gap-3"><Keyboard className="size-5 text-primary" />Keyboard shortcuts</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground"><dt><kbd>⌘/Ctrl K</kbd></dt><dd>Search chats</dd><dt><kbd>⌘/Ctrl N</kbd></dt><dd>New chat</dd><dt><kbd>⌘/Ctrl ,</kbd></dt><dd>Settings</dd></dl>
        </div>
      </div>
    </Page>
  );
}
