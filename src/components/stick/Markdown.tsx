import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border bg-code">
      <div className="flex items-center justify-between border-b px-4 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{lang || "text"}</span>
        <button
          aria-label="Copy code"
          className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent hover:text-foreground"
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className={`prose-chat ${streaming ? "stream-caret" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noreferrer" />,
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const m = /language-(\w+)/.exec(className || "");
            const s = String(children);
            if (m || s.includes("\n")) return <CodeBlock lang={m?.[1] ?? ""} code={s.replace(/\n$/, "")} />;
            return <code>{children}</code>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
