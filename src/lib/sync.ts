import { useStore, type Conversation, type RemoteSnapshot } from "./store";

let ready = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Text-only copy of local data (images are too large to sync) trimmed to fit the server limit. */
function snapshot(): Required<RemoteSnapshot> {
  const s = useStore.getState();
  const strip = (c: Conversation): Conversation => ({ ...c, messages: c.messages.map(({ images, ...m }) => (images?.length ? { ...m, content: m.content || "(image)" } : m)) });
  const convs = s.conversations.filter((c) => !c.temporary).sort((a, b) => b.updatedAt - a.updatedAt).map(strip);
  const kept: Conversation[] = [];
  let size = 0;
  for (const c of convs) {
    size += JSON.stringify(c).length;
    if (size > 700_000) break;
    kept.push(c);
  }
  return { conversations: kept, projects: s.projects, tombstones: s.tombstones };
}

export async function pushNow(): Promise<void> {
  if (!useStore.getState().user) return;
  await fetch("/api/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot()) });
}

export async function pullAndMerge(): Promise<void> {
  const res = await fetch("/api/sync");
  if (res.status === 401) { useStore.getState().setUser(null); return; }
  if (!res.ok) return;
  useStore.getState().mergeRemote((await res.json()) as RemoteSnapshot);
}

/** Pull once, then push local changes (debounced) while signed in. Returns an unsubscribe function. */
export function startCloudSync(): () => void {
  const schedule = () => {
    if (!ready || !useStore.getState().user) return;
    clearTimeout(timer);
    timer = setTimeout(() => { pushNow().catch(() => {}); }, 2000);
  };
  const unsub = useStore.subscribe((s, p) => {
    if (s.conversations !== p.conversations || s.projects !== p.projects || s.tombstones !== p.tombstones) schedule();
  });
  (async () => {
    try {
      if (useStore.getState().user) { await pullAndMerge(); await pushNow(); }
    } catch { /* offline: try again on next load */ }
    ready = true;
  })();
  return () => { unsub(); clearTimeout(timer); ready = false; };
}

/** Call right after signing in or registering. */
export async function syncAfterLogin(): Promise<void> {
  await pullAndMerge();
  await pushNow();
  ready = true;
}
