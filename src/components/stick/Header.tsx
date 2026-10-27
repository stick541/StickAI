import { Check, ChevronDown, Menu, Sparkle, CircleDashed } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MODELS, useStore } from "@/lib/store";

export function Header({ isMobile, onUpgrade }: { isMobile: boolean; onUpgrade: () => void }) {
  const { model, setModel, temporary, setTemporary, setSidebar } = useStore();
  const current = MODELS.find((m) => m.id === model) ?? MODELS[0];
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-2 md:px-3">
      {isMobile && <button aria-label="Open sidebar" onClick={() => setSidebar(true)} className="rounded-lg p-2 hover:bg-accent"><Menu className="size-5" /></button>}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 rounded-lg px-3 py-2 text-lg font-medium hover:bg-accent">
          {current?.name}<ChevronDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 rounded-lg p-1.5 shadow-menu">
          {MODELS.map((m) => (
            <DropdownMenuItem key={m.id} onClick={() => setModel(m.id)} className="flex items-center gap-3 rounded-md py-2">
              <div className="flex-1"><div className="text-sm font-medium">{m.name}</div><div className="text-xs text-muted-foreground">{m.blurb}</div></div>
              {m.id === model && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="ml-auto flex items-center gap-1">
        <button onClick={onUpgrade} className="hidden items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/25 sm:flex"><Sparkle className="size-4" />Get Plus</button>
        <button
          aria-label={temporary ? "Turn off temporary chat" : "Turn on temporary chat"}
          aria-pressed={temporary}
          title="Temporary chat"
          onClick={() => setTemporary(!temporary)}
          className={`rounded-full p-2 transition-colors ${temporary ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
        >
          <CircleDashed className="size-5" />
        </button>
      </div>
    </header>
  );
}
