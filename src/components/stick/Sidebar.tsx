import { useState } from "react";
import { Boxes, Calendar, Folder, Image, Library, MoreHorizontal, PanelLeft, Pencil, Pin, PinOff, Search, SquarePen, Trash2, Ellipsis } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useStore, type Conversation } from "@/lib/store";

export const NAV = [
  { id: "images", label: "Images", icon: Image, text: "Create and edit images with Stick. Describe what you want in a chat and your creations will collect here." },
  { id: "library", label: "Library", icon: Library, text: "Files and images you share in chats will appear in your library." },
  { id: "scheduled", label: "Scheduled", icon: Calendar, text: "Ask Stick to remind you or run a task later — scheduled tasks show up here." },
  { id: "plugins", label: "Plugins", icon: Boxes, text: "Connect Stick to the tools you use every day." },
  { id: "projects", label: "Projects", icon: Folder, text: "Group related chats, files and instructions into projects." },
  { id: "more", label: "More", icon: MoreHorizontal, text: "More ways to use Stick are on the way." },
];

function group(convs: Conversation[]) {
  const day = 86400000, now = new Date(); now.setHours(0, 0, 0, 0);
  const t = now.getTime();
  const pinned: Conversation[] = [], today: Conversation[] = [], yesterday: Conversation[] = [], week: Conversation[] = [], older: Conversation[] = [];
  for (const c of [...convs].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (c.pinned) pinned.push(c);
    else if (c.updatedAt >= t) today.push(c);
    else if (c.updatedAt >= t - day) yesterday.push(c);
    else if (c.updatedAt >= t - 7 * day) week.push(c);
    else older.push(c);
  }
  const g: [string, Conversation[]][] = [["Pinned", pinned], ["Today", today], ["Yesterday", yesterday], ["Previous 7 days", week], ["Older", older]];
  return g.filter(([, v]) => v.length);
}

function ChatRow({ c, active, onPick }: { c: Conversation; active: boolean; onPick: () => void }) {
  const { rename, remove, togglePin } = useStore();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(c.title);
  if (editing)
    return (
      <input
        autoFocus value={val} aria-label="Rename chat"
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { rename(c.id, val.trim() || c.title); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setVal(c.title); setEditing(false); } }}
        className="w-full rounded-lg bg-sidebar-accent px-3 py-2 text-sm outline-none ring-1 ring-primary"
      />
    );
  return (
    <div className={`group flex items-center rounded-lg ${active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent"}`}>
      <button onClick={onPick} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm">{c.title}</button>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`Options for ${c.title}`} className="mr-1 rounded-md p-1 text-muted-foreground opacity-100 hover:text-foreground md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100">
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="rounded-lg shadow-menu">
          <DropdownMenuItem onClick={() => togglePin(c.id)}>{c.pinned ? <PinOff /> : <Pin />}{c.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditing(true)}><Pencil />Rename</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => remove(c.id)}><Trash2 className="text-destructive" />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function Sidebar({ isMobile, onSearch, onUpgrade, onSettings }: { isMobile: boolean; onSearch: () => void; onUpgrade: () => void; onSettings: (tab?: string) => void }) {
  const { sidebarOpen, setSidebar, conversations, activeId, setActive, newChat, view, setView, settings, user } = useStore();
  const collapsed = !isMobile && !sidebarOpen;
  const close = () => isMobile && setSidebar(false);
  const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent";
  const initials = settings.nickname.slice(0, 2).toUpperCase() || "ST";

  return (
    <>
      {isMobile && sidebarOpen && <div className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm" onClick={close} aria-hidden />}
      <aside
        aria-label="Sidebar"
        className={`z-40 flex h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-300 ease-out ${
          isMobile ? `fixed inset-y-0 left-0 w-[16.5rem] ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}` : collapsed ? "w-16" : "w-[16.5rem]"
        }`}
      >
        <div className={`flex h-14 items-center px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
          {collapsed ? (
            <button aria-label="Open sidebar" onClick={() => setSidebar(true)} className="group relative rounded-lg p-1 hover:bg-sidebar-accent">
              <img src="/stick-logo.png" alt="StickAI" className="size-7 rounded-lg group-hover:opacity-0" />
              <PanelLeft className="absolute inset-0 m-auto size-5 opacity-0 group-hover:opacity-100" />
            </button>
          ) : (
            <>
              <button onClick={() => { newChat(); close(); }} className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label="StickAI home">
                <img src="/stick-logo.png" alt="" className="size-7 rounded-lg" />
                <span className="font-semibold tracking-tight">Stick</span>
              </button>
              <button aria-label="Close sidebar" onClick={() => setSidebar(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><PanelLeft className="size-5" /></button>
            </>
          )}
        </div>

        <nav className="space-y-0.5 px-2">
          <button className={item} title="New chat" onClick={() => { newChat(); close(); }}><SquarePen className="size-[18px] shrink-0" />{!collapsed && "New chat"}</button>
          <button className={item} title="Search chats" onClick={() => { onSearch(); close(); }}><Search className="size-[18px] shrink-0" />{!collapsed && <span className="flex-1 text-left">Search chats</span>}{!collapsed && <kbd className="text-xs text-muted-foreground">⌘K</kbd>}</button>
          {NAV.map((n) => (
            <button key={n.id} title={n.label} className={`${item} ${view === n.id ? "bg-sidebar-accent" : ""}`} onClick={() => { setView(n.id); close(); }}>
              <n.icon className="size-[18px] shrink-0" />{!collapsed && n.label}
            </button>
          ))}
        </nav>

        <div className="mt-4 flex-1 overflow-y-auto px-2">
          {!collapsed && group(conversations).map(([label, list]) => (
            <div key={label} className="mb-4">
              <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">{label}</h3>
              {list.map((c) => <ChatRow key={c.id} c={c} active={c.id === activeId && view === "chat"} onPick={() => { setActive(c.id); close(); }} />)}
            </div>
          ))}
          {!collapsed && conversations.length === 0 && <p className="px-3 text-xs text-muted-foreground">Your chats will appear here.</p>}
        </div>

        <div className={`flex items-center gap-2 border-t border-sidebar-border p-2 ${collapsed ? "justify-center" : ""}`}>
          <button onClick={() => onSettings(user ? undefined : "account")} aria-label="Open settings" className={`flex min-w-0 items-center gap-2 rounded-lg p-1.5 hover:bg-sidebar-accent ${collapsed ? "" : "flex-1"}`}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
            {!collapsed && <span className="min-w-0 text-left"><span className="block truncate text-sm">{settings.nickname}</span><span className="block truncate text-xs text-muted-foreground">{user ? user.email : "Sign in to sync chats"}</span></span>}
          </button>
          {!collapsed && <button onClick={onUpgrade} className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-sidebar-accent">Upgrade</button>}
        </div>
      </aside>
    </>
  );
}
