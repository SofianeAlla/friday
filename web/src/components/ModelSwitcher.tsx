// Quick model switcher for the active provider - including CLIs like Claude Code
// (Friday passes the choice through as `--model`). Changing the model also updates
// the context-window shown in the meter (e.g. Claude → 1M, not the 128K default).

import { useEffect, useRef, useState } from "react";
import { useFriday } from "@/store";
import { modelOptions } from "@/lib/models";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ModelSwitcher({ up = false }: { up?: boolean }) {
  const { activeProvider, addProvider } = useFriday();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!activeProvider) return null;
  const isOllama = activeProvider.kind === "cli" && /ollama/i.test(activeProvider.command || "");
  if (isOllama) return null; // local model = the pulled tag, not a swappable cloud model
  const opts = modelOptions(activeProvider);
  if (opts.length === 0 && !activeProvider.model) return null;

  const current = activeProvider.model || "default";
  const set = async (model: string) => {
    if (model && model !== activeProvider.model) await addProvider({ id: activeProvider.id, model });
    setOpen(false); setCustom("");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Switch model"
        className={`flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 transition-colors ${open ? "border-accent bg-secondary" : "border-border bg-secondary hover:border-accent"}`}
      >
        <span className="text-[10px] uppercase tracking-bespoke-caps text-muted-foreground">Model</span>
        <span className="max-w-[150px] truncate text-xs tabular-nums text-foreground">{current}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className={`absolute z-50 min-w-64 rounded-md border border-border bg-card shadow-lg ${up ? "bottom-full mb-2 left-0" : "right-0 mt-2"}`}>
          <div className="border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-bespoke-caps text-accent">
            Available models
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {opts.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Type a model id below.</div>}
            {opts.map((m) => (
              <button
                key={m}
                onClick={() => void set(m)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors ${m === activeProvider.model ? "bg-accent/10 text-foreground" : "text-foreground hover:bg-secondary"}`}
              >
                <span className="truncate tabular-nums">{m}</span>
                {m === activeProvider.model && <span className="text-accent">✓</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 border-t border-border p-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && custom.trim()) void set(custom.trim()); }}
              placeholder="custom model id…"
              className="min-w-0 flex-1 rounded-sm border border-border bg-secondary px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-accent"
            />
            <button onClick={() => custom.trim() && void set(custom.trim())} className="rounded-sm border border-border bg-secondary px-2 py-1 text-[10px] uppercase tracking-bespoke-caps text-muted-foreground hover:border-accent hover:text-foreground">Set</button>
          </div>
        </div>
      )}
    </div>
  );
}
