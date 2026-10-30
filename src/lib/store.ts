import { create } from "zustand";
import { persist } from "zustand/middleware";
import { computeNext } from "./scheduler";

export type Role = "user" | "assistant";
export interface Message {
  id: string;
  role: Role;
  content: string;
  images?: string[];
  error?: string;
  retryAt?: number;
  feedback?: "up" | "down";
  suggestions?: string[];
  /** Plugin tool names the model used while writing this reply. */
  tools?: string[];
  /** Visible task progress emitted by the server while this reply is running. */
  activity?: { label: string; status: "active" | "done" }[];
  createdAt: number;
}
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  pinned?: boolean;
  updatedAt: number;
  temporary?: boolean;
  projectId?: string;
}
export interface Project { id: string; name: string; instructions: string; updatedAt: number }
export interface ScheduledTask {
  id: string;
  title: string;
  prompt: string;
  kind: "once" | "daily" | "weekly";
  time: string; // HH:MM, local time
  date?: string; // YYYY-MM-DD (once)
  weekday?: number; // 0-6 (weekly)
  enabled: boolean;
  nextRunAt: number | null;
  lastRunAt?: number;
}
export interface GeneratedImage { id: string; prompt: string; src: string; createdAt: number }
export interface Tombstone { id: string; at: number }
export type Theme = "dark" | "light" | "system";
export type Accent = "emerald" | "blue" | "slate";
export interface Settings {
  theme: Theme;
  accent: Accent;
  language: string;
  nickname: string;
  instructions: string;
  voice: string;
}

export const MODELS = [
  { id: "stick", name: "Stick", blurb: "Short, direct answers" },
  { id: "stick-1", name: "Stick 1", blurb: "Everyday questions" },
  { id: "stick-1-1", name: "Stick 1.1", blurb: "Separates facts, assumptions and unknowns" },
  { id: "stick-2", name: "Stick 2", blurb: "Writing, coding and difficult problems" },
  { id: "stick-2-1", name: "Stick 2.1", blurb: "Understands text and images" },
  { id: "stick-build", name: "Stick Build", blurb: "Complete code, pages, documents and plans" },
];
const DEFAULT_MODEL = "stick-1";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export interface RemoteSnapshot { conversations?: Conversation[]; projects?: Project[]; tombstones?: Tombstone[] }

interface State {
  conversations: Conversation[];
  activeId: string | null;
  settings: Settings;
  model: string;
  sidebarOpen: boolean;
  temporary: boolean;
  view: string; // "chat" or a sidebar view id
  plugins: string[]; // ids of enabled plugins
  projects: Project[];
  activeProject: string | null;
  scheduled: ScheduledTask[];
  images: GeneratedImage[];
  tombstones: Tombstone[];
  user: { email: string } | null;
  setActive: (id: string | null) => void;
  newChat: () => void;
  upsert: (c: Conversation) => void;
  patchMessage: (cid: string, mid: string, patch: Partial<Message>) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  togglePin: (id: string) => void;
  clearAll: () => void;
  setSettings: (s: Partial<Settings>) => void;
  setModel: (m: string) => void;
  setSidebar: (o: boolean) => void;
  setTemporary: (t: boolean) => void;
  setView: (v: string) => void;
  togglePlugin: (id: string) => void;
  setPlugin: (id: string, on: boolean) => void;
  addProject: (name: string) => string;
  updateProject: (id: string, patch: Partial<Pick<Project, "name" | "instructions">>) => void;
  removeProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  addTask: (t: Omit<ScheduledTask, "id" | "nextRunAt" | "enabled">) => void;
  patchTask: (id: string, patch: Partial<ScheduledTask>) => void;
  removeTask: (id: string) => void;
  addImage: (i: GeneratedImage) => void;
  removeImage: (id: string) => void;
  setUser: (u: { email: string } | null) => void;
  resetLocal: () => void;
  mergeRemote: (r: RemoteSnapshot) => void;
}

const MONTH = 30 * 86400000;
const pruneTombs = (t: Tombstone[]) => t.filter((x) => x.at > Date.now() - MONTH).slice(-500);

export const useStore = create<State>()(
  persist(
    (set) => ({
      conversations: [],
      activeId: null,
      settings: { theme: "dark", accent: "emerald", language: "English", nickname: "friend", instructions: "", voice: "" },
      model: DEFAULT_MODEL,
      sidebarOpen: true,
      temporary: false,
      view: "chat",
      plugins: [],
      projects: [],
      activeProject: null,
      scheduled: [],
      images: [],
      tombstones: [],
      user: null,
      setActive: (id) => set({ activeId: id, view: "chat" }),
      newChat: () => set({ activeId: null, view: "chat", activeProject: null }),
      upsert: (c) =>
        set((s) => {
          const exists = s.conversations.some((x) => x.id === c.id);
          return { conversations: exists ? s.conversations.map((x) => (x.id === c.id ? c : x)) : [c, ...s.conversations] };
        }),
      patchMessage: (cid, mid, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id !== cid ? c : { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === mid ? { ...m, ...patch } : m)) },
          ),
        })),
      rename: (id, title) => set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c)) })),
      remove: (id) =>
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
          tombstones: pruneTombs([...s.tombstones, { id, at: Date.now() }]),
        })),
      togglePin: (id) => set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, pinned: !c.pinned, updatedAt: Date.now() } : c)) })),
      clearAll: () =>
        set((s) => ({
          conversations: [],
          activeId: null,
          tombstones: pruneTombs([...s.tombstones, ...s.conversations.map((c) => ({ id: c.id, at: Date.now() }))]),
        })),
      setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      setModel: (model) => set({ model }),
      setSidebar: (sidebarOpen) => set({ sidebarOpen }),
      setTemporary: (temporary) => set({ temporary, activeId: null, view: "chat" }),
      setView: (view) => set({ view }),
      togglePlugin: (id) => set((s) => ({ plugins: s.plugins.includes(id) ? s.plugins.filter((x) => x !== id) : [...s.plugins, id] })),
      setPlugin: (id, on) => set((s) => ({ plugins: on ? (s.plugins.includes(id) ? s.plugins : [...s.plugins, id]) : s.plugins.filter((x) => x !== id) })),
      addProject: (name) => {
        const id = uid();
        set((s) => ({ projects: [{ id, name: name.trim() || "Untitled project", instructions: "", updatedAt: Date.now() }, ...s.projects], activeProject: id }));
        return id;
      },
      updateProject: (id, patch) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)) })),
      removeProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          activeProject: s.activeProject === id ? null : s.activeProject,
          conversations: s.conversations.map((c) => (c.projectId === id ? { ...c, projectId: undefined, updatedAt: Date.now() } : c)),
          tombstones: pruneTombs([...s.tombstones, { id, at: Date.now() }]),
        })),
      setActiveProject: (activeProject) => set({ activeProject }),
      addTask: (t) => set((s) => ({ scheduled: [...s.scheduled, { ...t, id: uid(), enabled: true, nextRunAt: computeNext(t) }] })),
      patchTask: (id, patch) => set((s) => ({ scheduled: s.scheduled.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      removeTask: (id) => set((s) => ({ scheduled: s.scheduled.filter((t) => t.id !== id) })),
      addImage: (i) => set((s) => ({ images: [i, ...s.images].slice(0, 30) })),
      removeImage: (id) => set((s) => ({ images: s.images.filter((i) => i.id !== id) })),
      setUser: (user) => set({ user }),
      resetLocal: () => set({ conversations: [], projects: [], tombstones: [], activeId: null, activeProject: null, plugins: [], images: [], scheduled: [] }),
      mergeRemote: (r) =>
        set((s) => {
          const dead = new Map<string, number>();
          for (const t of [...s.tombstones, ...(r.tombstones ?? [])]) dead.set(t.id, Math.max(dead.get(t.id) ?? 0, t.at));
          const pick = <T extends { id: string; updatedAt: number }>(remote: T[], local: T[]) => {
            const out = new Map<string, T>();
            for (const x of [...remote, ...local]) {
              const d = dead.get(x.id);
              if (d !== undefined && d >= x.updatedAt) continue;
              const cur = out.get(x.id);
              if (!cur || x.updatedAt >= cur.updatedAt) out.set(x.id, x);
            }
            return [...out.values()];
          };
          const conversations = pick(r.conversations ?? [], s.conversations);
          return {
            conversations,
            projects: pick(r.projects ?? [], s.projects),
            tombstones: pruneTombs([...dead].map(([id, at]) => ({ id, at }))),
            activeId: conversations.some((c) => c.id === s.activeId) ? s.activeId : null,
          };
        }),
    }),
    {
      name: "stickai",
      version: 2,
      migrate: (persisted: unknown) => {
        const p = (persisted ?? {}) as Partial<State>;
        return { ...p, model: MODELS.some((m) => m.id === p.model) ? p.model : DEFAULT_MODEL } as State;
      },
      partialize: (s) => ({
        conversations: s.conversations.filter((c) => !c.temporary),
        activeId: s.conversations.find((c) => c.id === s.activeId)?.temporary ? null : s.activeId,
        settings: s.settings,
        model: s.model,
        sidebarOpen: s.sidebarOpen,
        temporary: s.temporary,
        plugins: s.plugins,
        projects: s.projects,
        activeProject: s.activeProject,
        scheduled: s.scheduled,
        images: s.images,
        tombstones: s.tombstones,
        user: s.user,
      }),
    },
  ),
);
