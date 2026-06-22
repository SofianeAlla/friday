// Import drawer: pull existing conversations from Claude Code (~/.claude) and
// Codex (~/.codex) on this machine into Friday as projects + conversations.
// Reads the local transcripts, never the network. Re-importing is idempotent.

import { useEffect, useMemo, useState } from "react";
import { useFriday } from "@/store";
import { api, type ImportScan, type ImportSession, type ImportResult } from "@/lib/api";

function rel(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}

const SOURCE_LABEL: Record<string, string> = { claude: "Claude Code", codex: "Codex" };
const BTN = "px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps rounded-sm border transition-colors";
const ACTIVE = "bg-accent text-accent-foreground border-accent disabled:opacity-50";

function SourceMark({ source, className }: { source: string; className?: string }) {
  // Claude = warm orb, Codex = dark hex. Just enough to tell rows apart at a glance.
  if (source === "claude") {
    return <svg viewBox="0 0 24 24" className={className} aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#D97757" /><path d="M8 15l4-8 4 8" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.9" /><path d="M9 9l-3 3 3 3M15 9l3 3-3 3" fill="none" stroke="var(--background)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function ImportPanel() {
  const { setImportOpen, refresh } = useFriday();
  const [scan, setScan] = useState<ImportScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    api.scanImport("all")
      .then((s) => { setScan(s); setSelected(new Set(s.sessions.map((x) => x.sourceId))); })
      .catch((e) => setErr(String((e as Error).message || e)))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const by: Record<string, ImportSession[]> = {};
    for (const s of scan?.sessions ?? []) (by[s.source] ??= []).push(s);
    return by;
  }, [scan]);

  const sessions = scan?.sessions ?? [];
  const allSelected = sessions.length > 0 && selected.size === sessions.length;
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(sessions.map((s) => s.sourceId)));

  const doImport = async () => {
    if (!selected.size) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.runImport("all", [...selected]);
      setResult(r);
      await refresh();
    } catch (e) { setErr(String((e as Error).message || e)); }
    finally { setBusy(false); }
  };

  const nothingFound = !loading && sessions.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onMouseDown={() => setImportOpen(false)}>
      <div className="flex h-full w-full max-w-[560px] flex-col border-l border-sidebar-border bg-background" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border bg-background px-5">
          <h2 className="font-display text-2xl leading-none">Import conversations</h2>
          <button onClick={() => setImportOpen(false)} className="grid h-9 w-9 place-items-center rounded-sm border border-border text-muted-foreground hover:border-accent hover:text-foreground" aria-label="Close">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <p className="text-sm text-muted-foreground">
            Friday found these conversations from other agents on this machine. Import them as projects and threads — then keep going with any model.
          </p>

          {loading && <div className="mt-6 text-sm text-muted-foreground">Scanning ~/.claude and ~/.codex…</div>}
          {err && <div className="mt-4 rounded-sm border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{err}</div>}

          {result && (
            <div className="mt-4 rounded-sm border border-accent/40 bg-accent/10 p-3 text-xs text-accent">
              Imported {result.imported} conversation{result.imported === 1 ? "" : "s"} into {result.projects} project{result.projects === 1 ? "" : "s"}
              {result.skipped > 0 ? ` · ${result.skipped} already imported` : ""}.
            </div>
          )}

          {nothingFound && (
            <div className="mt-6 rounded-sm border border-border bg-card p-4 text-sm text-muted-foreground">
              No Claude Code or Codex sessions found.
              <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground/70">
                <div>{scan?.roots.claudeExists ? "✓" : "—"} {scan?.roots.claude}</div>
                <div>{scan?.roots.codexExists ? "✓" : "—"} {scan?.roots.codex}</div>
              </div>
            </div>
          )}

          {!loading && sessions.length > 0 && (
            <>
              <div className="mt-5 flex items-center justify-between">
                <button onClick={toggleAll} className="text-[11px] font-medium uppercase tracking-bespoke-caps text-accent hover:underline">
                  {allSelected ? "Clear all" : "Select all"}
                </button>
                <span className="text-[11px] tabular-nums text-muted-foreground">{selected.size} of {sessions.length} selected</span>
              </div>

              {(["claude", "codex"] as const).map((src) => {
                const list = groups[src];
                if (!list?.length) return null;
                return (
                  <section key={src} className="mt-5">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">
                      <SourceMark source={src} className="h-4 w-4 text-foreground" /> {SOURCE_LABEL[src]} · {list.length}
                    </div>
                    <div className="space-y-1.5">
                      {list.map((s) => {
                        const on = selected.has(s.sourceId);
                        return (
                          <label key={s.sourceId} className={`flex cursor-pointer items-start gap-3 rounded-sm border p-2.5 transition-colors ${on ? "border-accent/50 bg-accent/5" : "border-border bg-card hover:border-accent/40"}`}>
                            <input type="checkbox" checked={on} onChange={() => toggle(s.sourceId)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-foreground">{s.title}</span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                <span className="font-mono">{s.projectName}</span> · {s.messageCount} msg · {rel(s.updatedAt)}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>

        {!loading && sessions.length > 0 && (
          <div className="shrink-0 border-t border-sidebar-border bg-background px-5 py-3">
            <button onClick={() => void doImport()} disabled={busy || selected.size === 0} className={`${BTN} ${ACTIVE} w-full`}>
              {busy ? "Importing…" : result ? "Import more" : `Import ${selected.size} conversation${selected.size === 1 ? "" : "s"}`}
            </button>
            <p className="mt-2 text-center text-[10px] text-muted-foreground/70">Reads local files only. Re-importing the same session is skipped.</p>
          </div>
        )}
      </div>
    </div>
  );
}
