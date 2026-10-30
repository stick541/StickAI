import { PLUGINS, toolsFor } from "./plugins";
import { useStore } from "./store";

/**
 * Talks to the StickAI backend (/api/chat). In development only, if the server has no model
 * configured (STICK_API_URL unset) or can't be reached, it falls back to a simulated "preview" reply.
 */
export interface ChatRequest {
  model: string;
  think: boolean;
  instructions: string;
  nickname: string;
  language: string;
  /** Ids of enabled plugins. */
  plugins: string[];
  history: { role: "user" | "assistant"; content: string }[];
  images: string[];
}

export interface ReplyHooks { onTool?: (toolName: string) => void; onActivity?: (label: string, status: "active" | "done") => void }

export async function streamReply(req: ChatRequest, onToken: (t: string) => void, signal: AbortSignal, hooks: ReplyHooks = {}): Promise<{ suggestions: string[] }> {
  let res: Response | null = null;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...req, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
  }
  if (!res || res.status === 501 || res.status === 404) {
    // The simulated "preview" reply is for local development only. In production never pretend to be the AI.
    if (import.meta.env["DEV"]) return previewReply(req, onToken, signal);
    throw new Error(res ? "Stick isn't connected to an AI model yet. The site owner needs to finish the setup." : "Couldn't reach the server. Check your connection and try again.");
  }
  if (res.status === 401) {
    useStore.getState().setUser(null); // sends the person back to the sign-in screen
    throw new Error("Your session ended. Please sign in again.");
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "The model couldn't be reached. Check your connection and try again.");
  }
  if (!res.body) throw new Error("The model returned an empty response.");

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let suggestions = ["Tell me more", "Give me an example", "Summarize that in one line"];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (!line.startsWith("data:")) continue;
      const evt = JSON.parse(line.slice(5)) as { type: string; text?: string; name?: string; items?: string[]; message?: string; label?: string; status?: "active" | "done" };
      if (evt.type === "token" && evt.text) onToken(evt.text);
      else if (evt.type === "tool" && evt.name) hooks.onTool?.(evt.name);
      else if (evt.type === "activity" && evt.label) hooks.onActivity?.(evt.label, evt.status ?? "active");
      else if (evt.type === "suggestions" && evt.items) suggestions = evt.items;
      else if (evt.type === "error") throw new Error(evt.message || "The model couldn't be reached.");
    }
  }
  return { suggestions };
}

async function previewReply(req: ChatRequest, onToken: (t: string) => void, signal: AbortSignal) {
  const last = req.history[req.history.length - 1]?.content ?? "";
  if (/\bfail\b|simulate error/i.test(last)) {
    await wait(600, signal);
    throw new Error("The model couldn't be reached. Check your connection and try again.");
  }
  const text = pluginReply(last, req) ?? buildReply(last, req);
  const tokens = text.match(/\s+|[^\s]+/g) ?? [];
  if (req.think) await wait(900, signal);
  for (const t of tokens) {
    await wait(14 + Math.random() * 28, signal);
    onToken(t);
  }
  return { suggestions: ["Tell me more", "Give me an example", "Summarize that in one line"] };
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((res, rej) => {
    if (signal.aborted) return rej(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(res, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

function buildReply(prompt: string, req: ChatRequest) {
  const short = prompt.length > 80 ? prompt.slice(0, 80) + "…" : prompt;
  const img = req.images.length ? `\n\nI can see you attached **${req.images.length} image${req.images.length > 1 ? "s" : ""}** — once a vision model is connected, I'll describe them in detail.` : "";
  if (/code|function|javascript|typescript|python/i.test(prompt)) {
    return `Here's a small, tidy example to get you started:\n\n\`\`\`ts\nexport function greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet("${req.nickname}"));\n\`\`\`\n\nA few notes:\n\n- The function is **pure**, so it's easy to test.\n- Swap \`console.log\` for your UI of choice.\n\nWant me to add tests or convert it to another language?${img}`;
  }
  return `Thanks for asking about *"${short}"* — I'm running in **preview mode** right now, so this is a simulated reply from ${req.think ? "a thoughtful" : "a quick"} Stick.${img}\n\nHere's how I'd usually approach it:\n\n1. **Clarify the goal** — what outcome matters most to you?\n2. **Break it down** into small, doable steps.\n3. **Check the result** against what you expected.\n\n| Step | Focus | Time |\n| --- | --- | --- |\n| Plan | Goals | 5 min |\n| Do | Execution | 20 min |\n| Review | Lessons | 5 min |\n\nConnect a real model and I'll give you a genuine, detailed answer.`;
}

export function titleFrom(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t ? (t.length > 40 ? t.slice(0, 40) + "…" : t) : "Image chat";
}

/** Preview-mode only: shows how a connected plugin would be picked up. Replace with real tool calls. */
function pluginReply(prompt: string, req: ChatRequest) {
  const hit = PLUGINS.find((p) => req.plugins.includes(p.id) && p.keywords.test(prompt));
  if (!hit) return null;
  const tools = toolsFor([hit.id]).map((t) => `\`${t.name}\``).join(", ");
  return `This looks like a job for **${hit.name}**. I'd call ${tools} for you.\n\nPlugins are connected in this preview, but the live ${hit.name} account link isn't set up yet — so I can't fetch real data. Once your backend runs the tool and returns the result, I'll answer from it.`;
}
