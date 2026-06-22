// Git / GitHub drawer: connect a remote, then commit + push the active project in
// one click. Runs git on your machine using your existing credentials.

import { useEffect, useState } from "react";
import { useFriday } from "@/store";
import { api, type GitResult, type GitStatus } from "@/lib/api";

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const BTN = "px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps rounded-sm border transition-colors";
const ACTIVE = "bg-accent text-accent-foreground border-accent disabled:opacity-50";
const IDLE = "bg-secondary text-foreground border-border hover:border-accent";
const INPUT = "w-full bg-secondary border border-border rounded-sm px-3 py-2 text-sm text-foreground focus:border-accent outline-none";

export function GitPanel() {
  const { setGitOpen, activeProject } = useFriday();
  const [st, setSt] = useState<GitStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [url, setUrl] = useState("");
  const [out, setOut] = useState<string | null>(null);

  const load = () => api.gitStatus().then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);

  const act = async (fn: () => Promise<GitResult>) => {
    setBusy(true); setOut(null);
    try { const r = await fn(); setOut(r.output || r.message || (r.ok ? "Done." : "Failed.")); await load(); }
    catch (e) { setOut(String((e as Error).message || e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onMouseDown={() => setGitOpen(false)}>
      <div className="h-full w-full max-w-[520px] overflow-y-auto border-l border-sidebar-border bg-background" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-sidebar-border bg-background px-5">
          <div className="flex items-center gap-2">
            <GitHubMark className="h-5 w-5 text-foreground" />
            <h2 className="font-display text-2xl leading-none">GitHub</h2>
          </div>
          <button onClick={() => setGitOpen(false)} className="grid h-9 w-9 place-items-center rounded-sm border border-border text-muted-foreground hover:border-accent hover:text-foreground" aria-label="Close">✕</button>
        </div>

        <div className="space-y-4 px-5 py-6">
          {!activeProject ? (
            <p className="text-sm text-muted-foreground">Open a project first (left sidebar), then connect it to GitHub.</p>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                Project: <span className="font-mono text-foreground">{activeProject.name}</span>
              </div>

              {st?.gitMissing && (
                <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  Git isn't installed. Get it from <a className="underline" href="https://git-scm.com" target="_blank" rel="noreferrer">git-scm.com</a>, then reopen this.
                </div>
              )}

              {st && !st.isRepo && !st.gitMissing && (
                <div className="space-y-2 rounded-sm border border-border bg-card p-3">
                  <div className="text-sm text-foreground">This folder isn't a Git repository yet.</div>
                  <button onClick={() => void act(() => api.gitInit())} disabled={busy} className={`${BTN} ${ACTIVE}`}>Initialize repository</button>
                </div>
              )}

              {st?.isRepo && (
                <div className="space-y-4">
                  <div className="rounded-sm border border-border bg-card p-3 text-xs">
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground">
                      <span>Branch: <span className="font-mono text-foreground">{st.branch || "-"}</span></span>
                      <span>Changes: <span className="tabular-nums text-foreground">{st.dirty ?? 0}</span></span>
                      {(st.ahead ?? 0) > 0 && <span>Ahead: <span className="tabular-nums text-foreground">{st.ahead}</span></span>}
                      {(st.behind ?? 0) > 0 && <span>Behind: <span className="tabular-nums text-foreground">{st.behind}</span></span>}
                    </div>
                    <div className="mt-1 truncate text-muted-foreground">
                      Remote: {st.remote ? <span className="font-mono text-foreground">{st.remote}</span> : <span className="text-muted-foreground/70">none</span>}
                    </div>
                  </div>

                  {!st.remote && (
                    <div className="space-y-2 rounded-sm border border-border bg-card p-3">
                      <div className="text-[11px] font-medium uppercase tracking-bespoke-caps text-accent">Connect a GitHub remote</div>
                      <p className="text-[11px] text-muted-foreground">Create an empty repo on github.com, copy its URL, and paste it here.</p>
                      <div className="flex items-center gap-2">
                        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/you/repo.git" className={`${INPUT} font-mono`} />
                        <button onClick={() => url.trim() && void act(() => api.gitConnect(url.trim()))} disabled={busy || !url.trim()} className={`${BTN} ${ACTIVE} shrink-0`}>Connect</button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 rounded-sm border border-border bg-card p-3">
                    <div className="text-[11px] font-medium uppercase tracking-bespoke-caps text-accent">Commit{st.remote ? " & push" : ""}</div>
                    <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} placeholder="Commit message (optional)" className={`${INPUT} resize-none`} />
                    <button onClick={() => void act(() => api.gitCommitPush(msg))} disabled={busy} className={`${BTN} ${ACTIVE} w-full`}>
                      {busy ? "Working…" : st.remote ? "Commit & Push" : "Commit (no remote yet)"}
                    </button>
                    <p className="text-[10px] text-muted-foreground/70">Uses your machine's Git credentials. Stages all changes (git add -A).</p>
                  </div>
                </div>
              )}

              {out && <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-background p-3 font-mono text-[11px] text-muted-foreground">{out}</pre>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
