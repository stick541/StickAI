import { useCallback, useEffect, useRef, useState } from "react";
import { CircleDashed } from "lucide-react";
import { toast } from "sonner";
import { useStore, uid, MODELS, type Conversation, type Message, type ScheduledTask } from "@/lib/store";
import { streamReply, titleFrom } from "@/lib/ai";
import { computeNext } from "@/lib/scheduler";
import { startCloudSync } from "@/lib/sync";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sidebar, NAV } from "./Sidebar";
import { Header } from "./Header";
import { Composer } from "./Composer";
import { Thread } from "./Thread";
import { PluginsView } from "./PluginsView";
import { ImagesView, LibraryView, MoreView, ProjectsView, ScheduledView } from "./Views";
import { SearchDialog, SettingsDialog, UpgradeDialog } from "./Dialogs";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function ChatApp() {
  const s = useStore();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | undefined>();
  const [upgrade, setUpgrade] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const active = s.conversations.find((c) => c.id === s.activeId) ?? null;
  const project = s.projects.find((p) => p.id === s.activeProject) ?? null;
  const openSettings = (tab?: string) => { setSettingsTab(tab); setSettingsOpen(true); };

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = s.settings.theme === "dark" || (s.settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    root.dataset["accent"] = s.settings.accent;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [s.settings.theme, s.settings.accent]);

  useEffect(() => { if (isMobile) s.setSidebar(false); }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const st = useStore.getState();
    const params = new URLSearchParams(location.search);
    const connected = params.get("plugin_connected");
    const failed = params.get("plugin_error");
    if (connected) { st.setPlugin(connected, true); st.setView("plugins"); toast(`${connected} connected.`); }
    if (failed) { st.setView("plugins"); toast(failed); }
    if (connected || failed) history.replaceState(null, "", location.pathname);

    return startCloudSync();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch(true); }
      else if (mod && e.key.toLowerCase() === "n" ) { e.preventDefault(); useStore.getState().newChat(); }
      else if (mod && e.key === ",") { e.preventDefault(); openSettings(); }
      else if (e.key === "Escape" && isMobile && useStore.getState().sidebarOpen) useStore.getState().setSidebar(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile]);

  const run = useCallback(async (conv: Conversation, think: boolean, images: string[]) => {
    const st = useStore.getState();
    const reply: Message = { id: uid(), role: "assistant", content: "", createdAt: Date.now() };
    const c = { ...conv, messages: [...conv.messages, reply], updatedAt: Date.now() };

    // Paint user message + thinking dots in the same tick — no waiting for the network
    st.upsert(c);
    setStreamingId(reply.id);

    const ctrl = new AbortController(); abort.current = ctrl;
    const proj = st.projects.find((p) => p.id === conv.projectId);
    const instructions = [st.settings.instructions, proj?.instructions && `Project "${proj.name}" instructions:\n${proj.instructions}`].filter(Boolean).join("\n\n");
    const model = MODELS.some((m) => m.id === st.model) ? st.model : (MODELS[1] ?? MODELS[0])?.id ?? "stick-1";
    let acc = "";
    const used: string[] = [];

    let raf = 0;
    let pending = "";
    const flush = () => {
      raf = 0;
      if (!pending) return;
      const text = pending;
      pending = "";
      useStore.getState().patchMessage(c.id, reply.id, { content: text });
    };
    const onToken = (t: string) => {
      acc += t;
      pending = acc;
      if (!raf) raf = requestAnimationFrame(flush);
    };

    try {
      const { suggestions } = await streamReply(
        { model, think, instructions, nickname: st.settings.nickname, language: st.settings.language, plugins: st.plugins, history: conv.messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })), images },
        onToken,
        ctrl.signal,
        {
          onTool: (name) => { if (!used.includes(name)) used.push(name); useStore.getState().patchMessage(c.id, reply.id, { tools: [...used] }); },
          onActivity: (label, status) => {
            const current = useStore.getState().conversations.find((x) => x.id === c.id)?.messages.find((x) => x.id === reply.id)?.activity ?? [];
            const next = current.filter((item) => item.label !== label);
            next.push({ label, status });
            useStore.getState().patchMessage(c.id, reply.id, { activity: next });
          },
        },
      );
      if (raf) { cancelAnimationFrame(raf); flush(); }
      useStore.getState().patchMessage(c.id, reply.id, { content: acc, suggestions });
    } catch (e) {
      if (raf) { cancelAnimationFrame(raf); flush(); }
      if ((e as Error).name !== "AbortError") { const err = e as Error & { retryAt?: number }; useStore.getState().patchMessage(c.id, reply.id, { error: err.message || "Something went wrong.", ...(err.retryAt ? { retryAt: err.retryAt } : {}) }); }
      else if (!acc) useStore.getState().patchMessage(c.id, reply.id, { content: "_Stopped._" });
    } finally {
      setStreamingId(null); abort.current = null;
    }
  }, []);

  const runTask = useCallback((t: ScheduledTask) => {
    const st = useStore.getState();
    const now = Date.now();
    const user: Message = { id: uid(), role: "user", content: t.prompt, createdAt: now };
    const conv: Conversation = { id: uid(), title: t.title, messages: [user], updatedAt: now };
    st.patchTask(t.id, { lastRunAt: now, nextRunAt: computeNext(t, now), enabled: t.kind !== "once" });
    run(conv, false, []);
    toast(`Scheduled task ran: ${t.title}`, { action: { label: "Open", onClick: () => useStore.getState().setActive(conv.id) } });
  }, [run]);

  useEffect(() => {
    const tick = () => {
      if (abort.current) return;
      const now = Date.now();
      const due = useStore.getState().scheduled.find((t) => t.enabled && t.nextRunAt !== null && t.nextRunAt <= now);
      if (due) runTask(due);
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [runTask]);

  const send = (text: string, images: string[], think: boolean) => {
    const st = useStore.getState();
    const user: Message = { id: uid(), role: "user", content: text, images, createdAt: Date.now() };
    const base: Conversation = active ?? { id: uid(), title: titleFrom(text), messages: [], updatedAt: Date.now(), temporary: st.temporary, projectId: st.activeProject ?? undefined };
    const conv = { ...base, messages: [...base.messages, user] };
    // Switch to the chat immediately so the user sees their message + thinking dots with zero lag
    st.upsert(conv);
    st.setActive(conv.id);
    void run(conv, think, images);
  };

  const regenerate = () => {
    if (!active || streamingId) return;
    const msgs = [...active.messages];
    while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    const lastUser = msgs[msgs.length - 1];
    run({ ...active, messages: msgs }, false, lastUser?.images ?? []);
  };

  const navItem = NAV.find((n) => n.id === s.view);
  const page =
    s.view === "plugins" ? <PluginsView />
    : s.view === "projects" ? <ProjectsView />
    : s.view === "library" ? <LibraryView />
    : s.view === "images" ? <ImagesView />
    : s.view === "scheduled" ? <ScheduledView />
    : s.view === "more" ? <MoreView onSettings={openSettings} onUpgrade={() => setUpgrade(true)} />
    : null;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar isMobile={isMobile} onSearch={() => setSearch(true)} onUpgrade={() => setUpgrade(true)} onSettings={openSettings} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Header isMobile={isMobile} onUpgrade={() => setUpgrade(true)} />
        {page ? (
          page
        ) : navItem ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center animate-fade-up">
            <navItem.icon className="size-10 text-primary" />
            <h1 className="text-2xl font-semibold">{navItem.label}</h1>
            <p className="max-w-md text-muted-foreground">{navItem.text}</p>
            <button onClick={() => s.newChat()} className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover">Start a chat</button>
          </div>
        ) : active ? (
          <>
            <div className="flex-1 overflow-y-auto">
              {active.temporary && <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><CircleDashed className="size-3.5" />Temporary chat — not saved to history</p>}
              <Thread cid={active.id} messages={active.messages} streamingId={streamingId} onRegenerate={regenerate} onSuggest={(t) => send(t, [], false)} onUpgrade={() => setUpgrade(true)} />
            </div>
            <div className="mx-auto w-full max-w-3xl px-3 pb-3 md:px-4">
              <Composer onSend={send} onStop={() => abort.current?.abort()} streaming={!!streamingId} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-3 pb-[10vh] md:px-4">
            <div className="mb-8 text-center animate-fade-up">
              {s.temporary ? (
                <>
                  <h1 className="text-3xl font-semibold tracking-tight">Temporary chat</h1>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">This chat won't appear in your history or be saved.</p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">{project ? `Project: ${project.name}` : greeting()}</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-tight">How can I help, {s.settings.nickname}?</h1>
                </>
              )}
            </div>
            <div className="w-full max-w-3xl animate-fade-up [animation-delay:120ms]">
              <Composer hero onSend={send} onStop={() => abort.current?.abort()} streaming={!!streamingId} />
              <p className="mt-6 text-center text-xs text-muted-foreground">StickAI · Made by Stick</p>
            </div>
          </div>
        )}
      </main>
      <SearchDialog open={search} onOpenChange={setSearch} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} tab={settingsTab} />
      <UpgradeDialog open={upgrade} onOpenChange={setUpgrade} />
    </div>
  );
}
