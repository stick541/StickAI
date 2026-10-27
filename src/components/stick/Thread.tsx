import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Copy, RefreshCw, ThumbsDown, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import type { Message } from "@/lib/store";
import { useStore } from "@/lib/store";
import { Markdown } from "./Markdown";
import { pluginForTool } from "@/lib/plugins";

function Actions({ m, cid, onRegenerate, isLast }: { m: Message; cid: string; onRegenerate: () => void; isLast: boolean }) {
  const patch = useStore((s) => s.patchMessage);
  const voice = useStore((s) => s.settings.voice);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const b = "flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground";
  const speak = () => {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(m.content.replace(/[#*`|>-]/g, ""));
    const v = speechSynthesis.getVoices().find((x) => x.name === voice); if (v) u.voice = v;
    u.onend = () => setSpeaking(false);
    speechSynthesis.speak(u); setSpeaking(true);
  };
  return (
    <div className="mt-1 flex gap-0.5">
      <button aria-label="Copy" className={b} onClick={() => { navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</button>
      <button aria-label="Good response" aria-pressed={m.feedback === "up"} className={`${b} ${m.feedback === "up" ? "text-primary" : ""}`} onClick={() => patch(cid, m.id, { feedback: m.feedback === "up" ? undefined : "up" })}><ThumbsUp className="size-4" /></button>
      <button aria-label="Bad response" aria-pressed={m.feedback === "down"} className={`${b} ${m.feedback === "down" ? "text-primary" : ""}`} onClick={() => patch(cid, m.id, { feedback: m.feedback === "down" ? undefined : "down" })}><ThumbsDown className="size-4" /></button>
      <button aria-label={speaking ? "Stop reading" : "Read aloud"} className={b} onClick={speak}>{speaking ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
      {isLast && <button aria-label="Regenerate" className={b} onClick={onRegenerate}><RefreshCw className="size-4" /></button>}
    </div>
  );
}

export function Thread({ cid, messages, streamingId, onRegenerate, onSuggest }: { cid: string; messages: Message[]; streamingId: string | null; onRegenerate: () => void; onSuggest: (s: string) => void }) {
  const end = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, last?.content]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={m.id} className="flex flex-col items-end gap-2">
            {m.images && m.images.length > 0 && (
              <div className="flex gap-2">{m.images.map((s, j) => <img key={j} src={s} alt="Attached" className="size-32 rounded-xl object-cover" />)}</div>
            )}
            {m.content && <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-bubble px-4 py-2.5">{m.content}</div>}
          </div>
        ) : (
          <div key={m.id} className="flex gap-3">
            <img src="/stick-logo.png" alt="" className="mt-0.5 size-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              {m.tools && m.tools.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {[...new Set(m.tools.map((t) => pluginForTool(t)?.id))].map((id) => {
                    const p = pluginForTool(m.tools!.find((t) => pluginForTool(t)?.id === id)!);
                    return p ? <span key={p.id} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground"><img src={p.logo} alt="" className="size-4 rounded-sm bg-white object-contain" />Used {p.name}</span> : null;
                  })}
                </div>
              )}
              {m.error ? (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <div className="flex-1">{m.error}</div>
                  <button onClick={onRegenerate} className="rounded-md px-2 py-0.5 font-medium text-destructive hover:bg-destructive/15">Retry</button>
                </div>
              ) : m.id === streamingId && !m.content ? (
                <div className="flex h-7 items-center gap-1" aria-label="Stick is thinking">
                  {[0, 1, 2].map((d) => <span key={d} className="size-2 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 150}ms` }} />)}
                </div>
              ) : (
                <Markdown text={m.content} streaming={m.id === streamingId} />
              )}
              {m.id !== streamingId && !m.error && m.content && (
                <>
                  <Actions m={m} cid={cid} onRegenerate={onRegenerate} isLast={i === messages.length - 1} />
                  {i === messages.length - 1 && m.suggestions && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.suggestions.map((s) => (
                        <button key={s} onClick={() => onSuggest(s)} className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">{s}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ),
      )}
      <div ref={end} />
    </div>
  );
}
