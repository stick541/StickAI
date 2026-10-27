import { useEffect, useRef, useState } from "react";
import { ArrowUp, Lightbulb, Mic, Plus, Square, X } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { getPlugin } from "@/lib/plugins";

async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
  const max = 1024, scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = img.width * scale; c.height = img.height * scale;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.8);
}

export function Composer({ onSend, onStop, streaming, hero }: { onSend: (text: string, images: string[], think: boolean) => void; onStop: () => void; streaming: boolean; hero?: boolean }) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [think, setThink] = useState(false);
  const [listening, setListening] = useState(false);
  const [drag, setDrag] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const rec = useRef<any>(null);
  const connected = useStore((st) => st.plugins);

  useEffect(() => {
    const el = ta.current; if (!el) return;
    el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [text]);
  useEffect(() => { ta.current?.focus(); }, []);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const room = 3 - images.length;
    if (list.length > room) toast("You can attach up to 3 images.");
    const out = await Promise.all(list.slice(0, Math.max(room, 0)).map(compress));
    setImages((p) => [...p, ...out].slice(0, 3));
  };

  const submit = () => {
    if (streaming) return;
    if (!text.trim() && !images.length) return;
    onSend(text.trim(), images, think);
    setText(""); setImages([]);
  };

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast("Voice dictation isn't supported in this browser."); return; }
    if (listening) { rec.current?.stop(); return; }
    const r = new SR(); r.interimResults = true; r.continuous = true;
    const base = text ? text + " " : "";
    r.onresult = (e: any) => setText(base + Array.from(e.results).map((x: any) => x[0].transcript).join(""));
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); toast("Microphone unavailable."); };
    rec.current = r; r.start(); setListening(true);
  };

  const canSend = !!text.trim() || images.length > 0;
  const iconBtn = "flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        className={`rounded-[1.75rem] bg-card p-2 shadow-composer transition-shadow focus-within:ring-2 focus-within:ring-primary/70 ${drag ? "ring-2 ring-primary" : ""}`}
      >
        {images.length > 0 && (
          <div className="flex gap-2 px-2 pt-1 pb-2">
            {images.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt={`Attachment ${i + 1}`} className="size-16 rounded-xl object-cover" />
                <button aria-label="Remove image" onClick={() => setImages((p) => p.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={ta}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          onPaste={(e) => { if (e.clipboardData.files.length) addFiles(e.clipboardData.files); }}
          placeholder="Ask anything"
          aria-label="Message Stick"
          className={`block w-full resize-none bg-transparent px-3 outline-none placeholder:text-muted-foreground ${hero ? "py-3 text-base" : "py-2 text-[15px]"}`}
        />
        <div className="flex items-center gap-1">
          <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          <button aria-label="Attach images" className={iconBtn} onClick={() => file.current?.click()}><Plus className="size-5" /></button>
          <button
            aria-pressed={think}
            onClick={() => setThink(!think)}
            className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-colors ${think ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
          >
            <Lightbulb className="size-4" /> Think
          </button>
          {connected.length > 0 && (
            <div className="ml-1 flex -space-x-1.5" title="Connected plugins" aria-label={`${connected.length} plugins connected`}>
              {connected.slice(0, 5).map((id) => { const p = getPlugin(id); return p ? <img key={id} src={p.logo} alt={p.name} className="size-6 rounded-full bg-white object-contain p-0.5 ring-2 ring-card" /> : null; })}
              {connected.length > 5 && <span className="flex size-6 items-center justify-center rounded-full bg-accent text-[10px] ring-2 ring-card">+{connected.length - 5}</span>}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button aria-label={listening ? "Stop dictation" : "Dictate"} aria-pressed={listening} className={`${iconBtn} ${listening ? "bg-primary/15 text-primary animate-pulse" : ""}`} onClick={toggleMic}><Mic className="size-5" /></button>
            {streaming ? (
              <button aria-label="Stop generating" onClick={onStop} className="flex size-9 items-center justify-center rounded-full bg-foreground text-background"><Square className="size-3.5 fill-current" /></button>
            ) : (
              <button aria-label="Send message" disabled={!canSend} onClick={submit} className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-40"><ArrowUp className="size-5" /></button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">Stick can make mistakes. Check anything important.</p>
    </div>
  );
}
