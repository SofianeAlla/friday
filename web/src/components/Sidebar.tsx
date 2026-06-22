// Left rail (Claude Code-style): the active project (repo) + a switcher and
// "add repo" control, then this project's conversations - new / switch / delete.
// All per-project: switching projects swaps the conversation list and transcript.

import { useEffect, useRef, useState } from "react";
import { useFriday } from "@/store";
import { api } from "@/lib/api";

function rel(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}

function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const I_PLUS = "M12 5v14M5 12h14";
const I_CHEVRON = "m6 9 6 6 6-6";
const I_TRASH = "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14";
const I_FOLDER = "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
const I_IMPORT = "M12 3v12m0 0 4-4m-4 4-4-4M5 21h14";

function AddRepo({ onDone }: { onDone: () => void }) {
  const { addProject, platform } = useFriday();
  const examplePath = platform === "win32" ? "C:\\Users\\you\\project" : "/home/you/project";
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  async function add(p?: string) {
    const target = (p ?? path).trim();
    if (!target) return;
    setBusy(true); setErr(null);
    try { await addProject(target); onDone(); }
    catch (e) { setErr(String((e as Error).message || e)); setBusy(false); }
  }

  async function browse() {
    setErr(null);
    try {
      const r = await api.pickFolder();
      if (r.path) await add(r.path);
      else if (r.error) setErr(r.error);
    } catch (e) { setErr(String((e as Error).message || e)); }
  }

  return (
    <div className="space-y-2 rounded-sm border border-accent/40 bg-accent/5 p-2.5">
      <div className="text-[10px] font-medium uppercase tracking-bespoke-caps text-accent">Add a repo / folder</div>
      <button
        onClick={() => void browse()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-sm border border-accent bg-accent px-2 py-2 text-[11px] font-medium uppercase tracking-bespoke-caps text-accent-foreground hover:opacity-90 disabled:opacity-50"
      >
        <Icon d={I_FOLDER} size={15} /> {busy ? "Opening…" : "Browse…"}
      </button>
      <div className="text-center text-[10px] text-muted-foreground/60">or paste a path</div>
      <input
        ref={ref}
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void add(); if (e.key === "Escape") onDone(); }}
        placeholder={examplePath}
        className="w-full rounded-sm border border-border bg-secondary px-2 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-accent"
      />
      {err && <div className="text-[10px] text-red-400">{err}</div>}
      <div className="flex gap-1.5">
        <button onClick={() => void add()} disabled={busy || !path.trim()} className="flex-1 rounded-sm border border-border bg-secondary px-2 py-1 text-[10px] font-medium uppercase tracking-bespoke-caps text-foreground hover:border-accent disabled:opacity-50">
          {busy ? "Adding…" : "Add path"}
        </button>
        <button onClick={onDone} className="rounded-sm border border-border bg-secondary px-2 py-1 text-[10px] font-medium uppercase tracking-bespoke-caps text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const {
    projects, activeProject, setActiveProject, deleteProject,
    conversations, activeConversationId, newConversation, setActiveConversation, deleteConversation,
    setImportOpen,
  } = useFriday();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPickerOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* project switcher */}
      <div ref={rootRef} className="relative border-b border-sidebar-border p-3">
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-bespoke-caps text-accent">Project</div>
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-sm border border-border bg-secondary px-2.5 py-2 text-left hover:border-accent"
        >
          <span className="text-muted-foreground"><Icon d={I_FOLDER} size={15} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-foreground">{activeProject ? activeProject.name : "No project"}</span>
            {activeProject && <span className="block truncate font-mono text-[10px] text-muted-foreground">{activeProject.path}</span>}
          </span>
          {activeProject?.isGit && <span className="rounded-sm border border-border px-1 py-0.5 text-[8px] uppercase tracking-bespoke-caps text-muted-foreground">git</span>}
          <span className="text-muted-foreground"><Icon d={I_CHEVRON} /></span>
        </button>

        {pickerOpen && (
          <div className="absolute left-3 right-3 z-50 mt-1 rounded-md border border-border bg-card shadow-lg">
            <div className="max-h-64 overflow-y-auto py-1">
              {projects.length === 0 && <div className="px-3 py-2 text-[11px] text-muted-foreground">No repos yet.</div>}
              {projects.map((p) => (
                <div key={p.id} className={`group flex items-center gap-2 px-2.5 py-1.5 ${p.id === activeProject?.id ? "bg-accent/10" : "hover:bg-secondary"}`}>
                  <button onClick={() => { void setActiveProject(p.id); setPickerOpen(false); }} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-xs font-medium text-foreground">{p.name}</span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">{p.path}</span>
                  </button>
                  <button onClick={() => void deleteProject(p.id)} title="Remove from list" className="text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"><Icon d={I_TRASH} size={13} /></button>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setPickerOpen(false); setAdding(true); }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Icon d={I_PLUS} /> Add a repo / folder
            </button>
            <button
              onClick={() => { setPickerOpen(false); setImportOpen(true); }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Icon d={I_IMPORT} /> Import from Claude / Codex
            </button>
          </div>
        )}

        {adding && <div className="mt-2"><AddRepo onDone={() => setAdding(false)} /></div>}
        {!adding && projects.length === 0 && (
          <button onClick={() => setAdding(true)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-sm border border-accent bg-accent px-2 py-1.5 text-[10px] font-medium uppercase tracking-bespoke-caps text-accent-foreground">
            <Icon d={I_PLUS} /> Add your first repo
          </button>
        )}
      </div>

      {/* conversations */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-bespoke-caps text-accent">Conversations</span>
        <button
          onClick={() => void newConversation()}
          disabled={!activeProject}
          title="New conversation"
          className="grid h-6 w-6 place-items-center rounded-sm border border-border text-muted-foreground hover:border-accent hover:text-foreground disabled:opacity-40"
        >
          <Icon d={I_PLUS} size={13} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!activeProject && <div className="px-1.5 py-2 text-[11px] text-muted-foreground">Add a repo to start a conversation.</div>}
        {activeProject && conversations.length === 0 && <div className="px-1.5 py-2 text-[11px] text-muted-foreground">No conversations yet.</div>}
        {conversations.map((c) => {
          const active = c.id === activeConversationId;
          return (
            <div key={c.id} className={`group flex items-center gap-1 rounded-sm px-2 py-1.5 ${active ? "bg-accent/10" : "hover:bg-secondary"}`}>
              <button onClick={() => void setActiveConversation(c.id)} className="min-w-0 flex-1 text-left">
                <span className={`block truncate text-xs ${active ? "font-medium text-foreground" : "text-foreground/90"}`}>{c.title || "New conversation"}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {rel(c.updatedAt)}{c.providerLabel ? ` · ${c.providerLabel}` : ""}{c.messageCount ? ` · ${c.messageCount} msg` : ""}
                </span>
              </button>
              <button onClick={() => void deleteConversation(c.id)} title="Delete conversation" className="text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"><Icon d={I_TRASH} size={13} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
