// The Barn - Friday's stable of the best open-weight coding models. One click
// installs a model and wires it up as a provider. Local models run through a
// runtime Friday provisions for you; the card shows the engine state, live
// install progress, and warns when a model is too heavy for this machine.

import { useEffect, useState } from "react";
import { useFriday } from "@/store";
import { api, type BarnModel, type InstallEvent, type RuntimeStatus } from "@/lib/api";
import { ModelLogo, type Family } from "@/components/ModelLogo";

interface InstallState {
  phase: "running" | "done" | "error";
  message?: string;
  logs: string[];
  pct?: number;
  needsKey?: boolean;
}

const ctxLabel = (k?: number) => (k ? (k >= 1000 ? `${k / 1000}M` : `${k}K`) : null);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" className="animate-spin shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

function EngineChip({ rt }: { rt: RuntimeStatus | null }) {
  if (!rt) return null;
  const known = rt.hasManaged || rt.hasSystem;
  const label = rt.serverUp ? "Engine running" : known ? "Engine installed" : "Engine: sets up on first install";
  const live = rt.serverUp;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-bespoke-caps text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-accent animate-pulse" : "bg-muted-foreground/50"}`} />
      {label}
      {rt.totalMemGB ? <span className="text-muted-foreground/70">· {rt.totalMemGB} GB RAM</span> : null}
    </span>
  );
}

// Inline API-key entry, right in the card - no detour to Settings.
function ApiKeyAdd({ model, onAdd }: { model: BarnModel; onAdd: (key: string) => Promise<void> }) {
  const { setView } = useFriday();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (added) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-accent">✓ Added & selected.</div>
        <button onClick={() => setView("chat")} className="w-full rounded-sm border border-accent bg-accent px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps text-accent-foreground hover:opacity-90">
          Start vibe coding →
        </button>
      </div>
    );
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-sm border border-accent bg-accent px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps text-accent-foreground hover:opacity-90">
        Add API key
      </button>
    );
  }
  const submit = async () => {
    if (!key.trim()) return;
    setBusy(true); setErr(null);
    try { await onAdd(key.trim()); setAdded(true); }
    catch (e) { setErr(String((e as Error).message || e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <input
        type="password" value={key} autoFocus autoComplete="off"
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); if (e.key === "Escape") setOpen(false); }}
        placeholder={`Paste your ${model.vendor} API key`}
        className="w-full rounded-sm border border-border bg-secondary px-2.5 py-1.5 font-mono text-xs text-foreground outline-none focus:border-accent"
      />
      <div className="flex items-center gap-1.5">
        <button onClick={() => void submit()} disabled={busy || !key.trim()} className="flex-1 rounded-sm border border-accent bg-accent px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps text-accent-foreground disabled:opacity-50 hover:opacity-90">
          {busy ? "Connecting…" : "Connect & use"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-sm border border-border bg-secondary px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps text-muted-foreground hover:border-accent">Cancel</button>
      </div>
      <div className="flex items-center justify-between">
        {model.docsUrl ? <a href={model.docsUrl} target="_blank" rel="noreferrer" className="text-[10px] text-accent underline underline-offset-2">Get a key →</a> : <span />}
        <span className="text-[10px] text-muted-foreground/70">stored locally</span>
      </div>
      {err && <div className="text-[10px] text-red-400">{err}</div>}
    </div>
  );
}

function ModelCard({ model, state, onInstall, onAddApi, onUse, installed, rt }: { model: BarnModel; state?: InstallState; onInstall: () => void; onAddApi: (key: string) => Promise<void>; onUse: () => Promise<void>; installed: Set<string>; rt: RuntimeStatus | null }) {
  const { setView } = useFriday();
  const [armed, setArmed] = useState(false);
  const running = state?.phase === "running";
  const done = state?.phase === "done";

  const tag = model.ollamaTag ?? "";
  const isInstalled = model.install === "ollama" && (installed.has(tag) || installed.has(`${tag}:latest`));

  const ramGB = rt?.totalMemGB ?? 0;
  const need = model.tier === "local" ? (model.vramGB ?? 0) : 0;
  const insufficient = need > 0 && ramGB > 0 && need > ramGB;
  const tight = need > 0 && ramGB > 0 && !insufficient && need > ramGB * 0.75;

  return (
    <div className={`rounded-md border bg-card p-4 transition-colors ${insufficient ? "border-red-500/30" : model.recommended ? "border-accent/40" : "border-border"}`}>
      <div className="flex items-start gap-3">
        <ModelLogo family={model.family as Family} size={34} label={model.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{model.name}</h3>
            {model.recommended && (
              <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-bespoke-caps text-accent">Recommended</span>
            )}
          </div>
          <div className="text-[11px] uppercase tracking-bespoke-caps text-muted-foreground">{model.vendor}</div>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{model.tagline}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {model.params && <Chip>{model.params}</Chip>}
        {ctxLabel(model.contextK) && <Chip>{ctxLabel(model.contextK)} ctx</Chip>}
        <Chip>{model.license}</Chip>
        {model.vramGB && <Chip>{model.vramGB} GB VRAM</Chip>}
        <Chip>{model.install === "ollama" ? "Local" : "API"}</Chip>
      </div>

      {model.highlight && (
        <div className="mt-3 rounded-sm border border-accent/25 bg-accent/5 px-2.5 py-1.5 text-[11px] text-accent">{model.highlight}</div>
      )}

      {insufficient && (
        <div className="mt-3 rounded-sm border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
          ⚠ Too heavy for this machine - needs ~{need} GB but you have {ramGB} GB RAM. It likely won't run (or will be extremely slow).
        </div>
      )}
      {tight && (
        <div className="mt-3 rounded-sm border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
          ⚠ Tight fit - needs ~{need} GB vs {ramGB} GB RAM. Expect slow responses.
        </div>
      )}

      <div className="mt-3">
        {model.install === "api" && <ApiKeyAdd model={model} onAdd={onAddApi} />}

        {model.install === "ollama" && !state && (
          isInstalled ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-accent">✓ Installed locally</div>
              <button
                onClick={async () => { await onUse(); setView("chat"); }}
                className="w-full rounded-sm border border-accent bg-accent px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps text-accent-foreground hover:opacity-90"
              >
                Use → vibe code
              </button>
            </div>
          ) : insufficient && !armed ? (
            <button
              onClick={() => setArmed(true)}
              className="w-full rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps text-red-300 hover:bg-red-500/20"
            >
              Too heavy - install anyway?
            </button>
          ) : (
            <button
              onClick={onInstall}
              className="w-full rounded-sm border border-accent bg-accent px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps text-accent-foreground transition-opacity hover:opacity-90"
            >
              Install locally
            </button>
          )
        )}

        {running && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs text-accent">
              <span className="flex min-w-0 items-center gap-2"><Spinner /> <span className="truncate">{state.message || "Installing…"}</span></span>
              {state.pct != null && <span className="shrink-0 tabular-nums">{state.pct}%</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              {state.pct != null
                ? <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${state.pct}%` }} />
                : <div className="h-full w-1/3 animate-pulse rounded-full bg-accent/70" />}
            </div>
            {state.logs.length > 0 && (
              <pre className="max-h-24 overflow-auto rounded-sm border border-border bg-background px-2 py-1 font-mono text-[10px] leading-snug text-muted-foreground">
                {state.logs.slice(-6).join("\n")}
              </pre>
            )}
          </div>
        )}

        {done && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-accent">{state.message || "Installed."}</div>
            <button onClick={() => setView("chat")} className="w-full rounded-sm border border-accent bg-accent px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps text-accent-foreground hover:opacity-90">
              Start vibe coding →
            </button>
          </div>
        )}

        {state?.phase === "error" && (
          <div className="space-y-2">
            <div className="text-xs text-red-400">{state.message}</div>
            <button onClick={onInstall} className="w-full rounded-sm border border-border bg-secondary px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps text-foreground hover:border-accent">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, sub, models, states, install, addApi, useLocal, installed, rt, badge }: {
  title: string; sub: string; models: BarnModel[];
  states: Record<string, InstallState>; install: (m: BarnModel) => void;
  addApi: (m: BarnModel, key: string) => Promise<void>;
  useLocal: (m: BarnModel) => Promise<void>;
  installed: Set<string>;
  rt: RuntimeStatus | null; badge?: React.ReactNode;
}) {
  if (!models.length) return null;
  return (
    <section className="mt-8 first:mt-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-medium uppercase tracking-bespoke-caps text-accent">{title}</span>
        {badge}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {models.map((m) => (
          <ModelCard key={m.id} model={m} state={states[m.id]} onInstall={() => install(m)} onAddApi={(key) => addApi(m, key)} onUse={() => useLocal(m)} installed={installed} rt={rt} />
        ))}
      </div>
    </section>
  );
}

export function Barn() {
  const { refresh } = useFriday();
  const [models, setModels] = useState<BarnModel[]>([]);
  const [states, setStates] = useState<Record<string, InstallState>>({});
  const [rt, setRt] = useState<RuntimeStatus | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const loadRt = () => api.getRuntimeStatus().then(setRt).catch(() => {});
  const loadInstalled = () => api.getLocalModels().then((r) => setInstalled(new Set(r.models.map((m) => m.name)))).catch(() => {});
  useEffect(() => {
    api.getBarn().then((r) => setModels(r.models)).catch((e) => setLoadErr(String(e.message || e)));
    loadRt();
    loadInstalled();
  }, []);

  const useLocal = async (m: BarnModel) => { await api.barnUse(m.id); await refresh(); };

  const install = (m: BarnModel) => {
    setStates((s) => ({ ...s, [m.id]: { phase: "running", logs: [], message: "Starting…" } }));
    api.installBarn(m.id, (e: InstallEvent) => {
      setStates((s) => {
        const cur = s[m.id] ?? { phase: "running" as const, logs: [] };
        if (e.type === "status") return { ...s, [m.id]: { ...cur, message: e.message } };
        if (e.type === "log") {
          const pm = e.line.match(/(\d{1,3})%/);
          const pct = pm ? clamp(parseInt(pm[1], 10), 0, 100) : cur.pct;
          return { ...s, [m.id]: { ...cur, logs: [...cur.logs, e.line], pct } };
        }
        if (e.type === "error") return { ...s, [m.id]: { ...cur, phase: "error", message: e.message } };
        if (e.type === "done") {
          void refresh();
          void loadRt();
          void loadInstalled();
          return { ...s, [m.id]: { ...cur, phase: "done", pct: 100, needsKey: e.needsKey, message: e.needsKey ? "Added - add your API key to start." : "Installed and selected." } };
        }
        return s;
      });
    });
  };

  // Add an API model with its key right here - register it configured + active, no Settings detour.
  const addApi = async (m: BarnModel, apiKey: string) => {
    const state = await api.addProvider({ preset: `barn:${m.id}`, kind: m.kind ?? "openai", label: m.name, baseUrl: m.kind === "anthropic" ? undefined : m.api!.baseUrl, model: m.api!.model, apiKey });
    const found = [...state.providers].reverse().find((p) => p.preset === `barn:${m.id}` && p.configured);
    if (found) await api.setActive(found.id);
    await refresh();
  };

  const local = models.filter((m) => m.tier === "local");
  const agentic = models.filter((m) => m.tier === "agentic");
  const closed = models.filter((m) => m.tier === "closed");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="font-display text-4xl">The Barn</div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Every model worth coding with, ready to run. Click install and it's wired up as a provider
        you can switch to instantly; your conversation comes with you.
      </p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        Open-weight models flag their license (it matters for commercial use); closed models just need a key.
      </p>

      {loadErr && <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{loadErr}</div>}

      <Section
        title="Local & self-hosted"
        sub="Runs on your machine, fully offline, no key. Friday installs and runs the local engine for you on first use; already-installed models show “Use”. (First install downloads the runtime, once.)"
        models={local} states={states} install={install} addApi={addApi} useLocal={useLocal} installed={installed} rt={rt}
        badge={<EngineChip rt={rt} />}
      />
      <Section
        title="Top-tier open-weight agentic"
        sub="Frontier open models served via API: strongest for multi-step, tool-using work. Paste a key on the card and you're coding."
        models={agentic} states={states} install={install} addApi={addApi} useLocal={useLocal} installed={installed} rt={rt}
      />
      <Section
        title="Closed models"
        sub="The proprietary frontier (Claude, GPT, Grok, Gemini, Mistral). Paste your provider key on the card."
        models={closed} states={states} install={install} addApi={addApi} useLocal={useLocal} installed={installed} rt={rt}
      />
    </div>
  );
}
