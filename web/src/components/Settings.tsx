// The right-hand Settings drawer. Four sections: Models (list + edit + delete +
// add-from-preset grouped by channel), Working directory, Permissions, Appearance.
// Reads everything from useFriday(); writes via addProvider/deleteProvider/
// updateSettings/setActive. Code stays thin - this is just configuration UI.

import { useEffect, useRef, useState } from "react";
import { useFriday } from "@/store";
import { CHANNEL_LABEL, THEME_COLORS } from "@/lib/brand";
import { matchPreset } from "@/lib/theme";
import { ModelLogo, familyForProvider } from "@/components/ModelLogo";
import { api, type CliStatus, type LocalModels, type PermissionMode, type ProviderConfig, type ProviderPreset, type RemoteSettings, type RemoteState } from "@/lib/api";

// ---- icons -------------------------------------------------------------
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}
function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 2.5l2.5 2.5L6 12.5l-3 .5.5-3L11 2.5z" />
    </svg>
  );
}
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8a.7.7 0 0 0 .7.6h3.4a.7.7 0 0 0 .7-.6l.6-8" />
    </svg>
  );
}
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

const INPUT =
  "w-full bg-secondary border border-border rounded-sm px-3 py-2 text-sm text-foreground focus:border-accent outline-none placeholder:text-muted-foreground";
const BTN =
  "px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps rounded-sm border transition-colors";
const BTN_IDLE = "bg-secondary text-foreground border-border hover:border-accent";
const BTN_ACTIVE = "bg-accent text-accent-foreground border-accent";

const CHANNELS: ProviderPreset["channel"][] = ["api", "cli", "local"];
const CHANNEL_BLURB: Record<string, string> = {
  api: "Paste an API key. Friday calls the provider directly.",
  cli: "Uses an installed agent CLI / your existing subscription.",
  local: "Runs offline on your machine via Ollama.",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-medium uppercase tracking-bespoke-caps text-accent">{children}</h3>;
}

function ChannelBadge({ channel }: { channel?: string }) {
  if (!channel) return null;
  return (
    <span className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">
      {CHANNEL_LABEL[channel] ?? channel}
    </span>
  );
}

// channel a provider belongs to, for its row badge
function providerChannel(p: ProviderConfig, presets: ProviderPreset[]): string {
  if (p.preset) {
    const preset = presets.find((pr) => pr.preset === p.preset);
    if (preset) return preset.channel;
  }
  if (p.kind === "cli") return "cli";
  if (p.kind === "anthropic") return "api";
  if (p.kind === "openai") return p.baseUrl ? "local" : "api";
  return "api";
}

export function Settings() {
  const { setSettingsOpen } = useFriday();

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onMouseDown={() => setSettingsOpen(false)}>
      <div
        className="w-full max-w-[600px] h-full bg-background border-l border-sidebar-border overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-sidebar-border bg-background px-5 h-14">
          <h2 className="font-display text-2xl leading-none">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="h-9 w-9 grid place-items-center rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-accent transition-colors"
            aria-label="Close settings"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-6 space-y-10">
          <ModelsSection />
          <LocalModelsSection />
          <PermissionsSection />
          <RemoteSection />
          <AppearanceSection />
        </div>
      </div>
    </div>
  );
}

// ---- 1. Models ---------------------------------------------------------
function ModelsSection() {
  const { providers, presets, activeProviderId } = useFriday();

  return (
    <section className="space-y-4">
      <div>
        <SectionLabel>Models</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          Bring any model. Switch between them mid-task - Friday keeps the full conversation.
        </p>
      </div>

      <div className="space-y-2">
        {providers.length === 0 && (
          <div className="rounded-sm border border-border bg-card px-3 py-4 text-center text-xs text-muted-foreground">
            No models yet. Add one below to get started.
          </div>
        )}
        {providers.map((p) => (
          <ProviderRow
            key={p.id}
            provider={p}
            channel={providerChannel(p, presets)}
            active={p.id === activeProviderId}
          />
        ))}
      </div>

      <AddModel />
    </section>
  );
}

// Managed install for CLI providers (claude/codex/gemini) - Friday installs the
// binary for you (npm, into its own dir); auth stays the CLI's own.
function CliInstall({ provider }: { provider: ProviderConfig }) {
  const { refresh } = useFriday();
  const [st, setSt] = useState<CliStatus | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [authHint, setAuthHint] = useState<string | undefined>();

  useEffect(() => { api.cliStatus(provider.id).then(setSt).catch(() => {}); }, [provider.id, provider.command]);

  if (!st || !st.applicable) return null;

  const run = () => {
    setPhase("running"); setLogs([]); setMsg("Installing…");
    api.installCli(provider.id, (e) => {
      if (e.type === "status") setMsg(e.message);
      else if (e.type === "log") setLogs((l) => [...l, e.line]);
      else if (e.type === "error") { setPhase("error"); setMsg(e.message); }
      else if (e.type === "done") { setPhase("done"); setMsg("Installed."); setAuthHint(e.authHint); void refresh(); api.cliStatus(provider.id).then(setSt).catch(() => {}); }
    });
  };

  const installed = st.installed || phase === "done";

  return (
    <div className="border-t border-border px-3 py-2.5 text-[11px]">
      {installed && phase !== "running" ? (
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span className="inline-flex items-center gap-1 text-accent"><CheckIcon className="h-3 w-3" /> CLI installed{st.managed ? " · managed by Friday" : st.onPath ? " · on PATH" : ""}</span>
          {(authHint || st.authHint) && <span className="text-muted-foreground/70">· {authHint || st.authHint}</span>}
        </div>
      ) : phase === "running" ? (
        <div className="space-y-1.5">
          <div className="text-accent">{msg || "Installing…"}</div>
          {logs.length > 0 && (
            <pre className="max-h-20 overflow-auto rounded-sm border border-border bg-background px-2 py-1 font-mono text-[10px] leading-snug text-muted-foreground">{logs.slice(-5).join("\n")}</pre>
          )}
        </div>
      ) : st.installable ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Not installed.</span>
          <button onClick={run} className={`${BTN} ${BTN_ACTIVE}`}>Install CLI for me</button>
          {phase === "error" && <span className="text-red-400">{msg}</span>}
          <span className="text-muted-foreground/70">Friday installs it (npm) into its own folder - no global install.</span>
        </div>
      ) : (
        <span className="text-muted-foreground">Friday can't auto-install <span className="font-mono">{st.binName}</span> - install it manually and ensure it's on your PATH.</span>
      )}
    </div>
  );
}

function ProviderRow({ provider, channel, active }: { provider: ProviderConfig; channel: string; active: boolean }) {
  const { setActive, deleteProvider } = useFriday();
  const [editing, setEditing] = useState(false);
  const [test, setTest] = useState<"idle" | "running" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState<string>("");
  const configured = provider.configured ?? false;

  async function runTest() {
    setTest("running"); setTestMsg("");
    try {
      const r = await api.testProvider(provider.id);
      setTest(r.ok ? "ok" : "fail");
      setTestMsg(r.message || (r.ok ? "Connected" : "Failed"));
    } catch (e) {
      setTest("fail"); setTestMsg(String((e as Error).message || e));
    }
  }

  return (
    <div className="rounded-sm border border-border bg-card">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <ModelLogo family={familyForProvider(provider)} size={22} label={provider.label} />
        <ChannelBadge channel={channel} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{provider.label}</span>
            {active && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-bespoke-caps text-accent">
                <CheckIcon className="h-2.5 w-2.5" /> Active
              </span>
            )}
            {!configured && (
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-bespoke-caps text-muted-foreground">
                needs setup
              </span>
            )}
          </div>
          {provider.model && <div className="truncate font-mono text-[11px] text-muted-foreground">{provider.model}</div>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {configured && (
            <button
              onClick={() => void runTest()}
              title={testMsg || "Test connection"}
              className={`rounded-sm border px-2 py-1 text-[10px] font-medium uppercase tracking-bespoke-caps transition-colors ${
                test === "ok"
                  ? "border-accent/50 text-accent"
                  : test === "fail"
                    ? "border-red-400/50 text-red-400"
                    : "border-border text-muted-foreground hover:border-accent hover:text-foreground"
              }`}
            >
              {test === "running" ? "…" : test === "ok" ? "✓" : test === "fail" ? "✕" : "Test"}
            </button>
          )}
          {!active && configured && (
            <button onClick={() => void setActive(provider.id)} className={`${BTN} ${BTN_IDLE}`}>
              Use
            </button>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className="h-8 w-8 grid place-items-center rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-accent transition-colors"
            aria-label="Edit model"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => void deleteProvider(provider.id)}
            className="h-8 w-8 grid place-items-center rounded-sm border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/50 transition-colors"
            aria-label="Delete model"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {testMsg && (test === "ok" || test === "fail") && (
        <div className={`px-3 pb-2 text-[11px] ${test === "ok" ? "text-accent" : "text-red-400"}`}>{testMsg}</div>
      )}

      {provider.kind === "cli" && <CliInstall provider={provider} />}

      {editing && <EditProvider provider={provider} onDone={() => setEditing(false)} />}
    </div>
  );
}

function EditProvider({ provider, onDone }: { provider: ProviderConfig; onDone: () => void }) {
  const { addProvider } = useFriday();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [model, setModel] = useState(provider.model ?? "");
  const [command, setCommand] = useState(provider.command ?? "");
  const [saving, setSaving] = useState(false);

  // Which fields to show by kind.
  const showApiKey = provider.kind === "anthropic" || provider.kind === "openai" || provider.kind === "cli";
  const showBaseUrl = provider.kind === "openai";
  const showModel = provider.kind === "anthropic" || provider.kind === "openai";
  const showCommand = provider.kind === "cli";

  async function save() {
    setSaving(true);
    const patch: Partial<ProviderConfig> = { id: provider.id };
    if (showApiKey && apiKey) patch.apiKey = apiKey;
    if (showBaseUrl) patch.baseUrl = baseUrl;
    if (showModel) patch.model = model;
    if (showCommand) patch.command = command;
    try {
      await addProvider(patch);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-border px-3 py-3">
      {showApiKey && (
        <Field label={provider.kind === "cli" ? "API key (optional)" : "API key"}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider.kind === "cli" ? "Optional - run the CLI on an API key instead of its login" : provider.configured ? "•••••• (saved - leave blank to keep)" : "Paste your API key"}
            className={INPUT}
            autoComplete="off"
          />
        </Field>
      )}
      {showBaseUrl && (
        <Field label="Base URL">
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" className={INPUT} />
        </Field>
      )}
      {showModel && (
        <Field label="Model">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model id" className={INPUT} />
        </Field>
      )}
      {showCommand && (
        <Field label="Command">
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="claude" className={`${INPUT} font-mono`} />
        </Field>
      )}
      <div className="flex items-center gap-2">
        <button onClick={() => void save()} disabled={saving} className={`${BTN} ${BTN_ACTIVE} disabled:opacity-50`}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onDone} className={`${BTN} ${BTN_IDLE}`}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddModel() {
  const { presets } = useFriday();
  const [activePreset, setActivePreset] = useState<ProviderPreset | null>(null);

  return (
    <div className="space-y-3 pt-2">
      <SectionLabel>Add a model</SectionLabel>

      {CHANNELS.map((channel) => {
        const inChannel = presets.filter((p) => p.channel === channel);
        if (inChannel.length === 0) return null;
        return (
          <div key={channel} className="space-y-2">
            <div className="flex items-center gap-2">
              <ChannelBadge channel={channel} />
              <span className="text-[11px] text-muted-foreground">{CHANNEL_BLURB[channel]}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {inChannel.map((preset) => {
                const selected = activePreset?.preset === preset.preset;
                return (
                  <button
                    key={preset.preset}
                    onClick={() => setActivePreset(selected ? null : preset)}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      selected ? "border-accent bg-accent/5" : "border-border bg-card hover:border-accent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <ModelLogo
                          family={familyForProvider({ kind: preset.kind, label: preset.label, model: preset.defaultModel, baseUrl: preset.defaultBaseUrl, command: preset.defaultCommand, preset: preset.preset })}
                          size={18}
                          label={preset.label}
                        />
                        <span className="truncate text-sm font-medium text-foreground">{preset.label}</span>
                      </span>
                      <ChannelBadge channel={preset.channel} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{preset.blurb}</p>
                  </button>
                );
              })}
            </div>
            {activePreset && activePreset.channel === channel && (
              <PresetForm preset={activePreset} onDone={() => setActivePreset(null)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PresetForm({ preset, onDone }: { preset: ProviderPreset; onDone: () => void }) {
  const { addProvider } = useFriday();
  const [label, setLabel] = useState(preset.label);
  const [model, setModel] = useState(preset.defaultModel ?? "");
  const [baseUrl, setBaseUrl] = useState(preset.defaultBaseUrl ?? "");
  const [command, setCommand] = useState(preset.defaultCommand ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const needs = preset.needs;

  async function save() {
    setSaving(true);
    const cfg: Partial<ProviderConfig> = { preset: preset.preset, label };
    if (needs.includes("model")) cfg.model = model;
    else if (preset.defaultModel) cfg.model = preset.defaultModel;
    if (needs.includes("baseUrl")) cfg.baseUrl = baseUrl;
    else if (preset.defaultBaseUrl) cfg.baseUrl = preset.defaultBaseUrl;
    if (needs.includes("command")) cfg.command = command;
    else if (preset.defaultCommand) cfg.command = preset.defaultCommand;
    if (needs.includes("apiKey")) cfg.apiKey = apiKey;
    try {
      await addProvider(cfg);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-accent/40 bg-accent/5 p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">Set up {preset.label}</span>
        {preset.docsUrl && (
          <a href={preset.docsUrl} target="_blank" rel="noreferrer" className="text-[11px] text-accent underline underline-offset-2">
            docs
          </a>
        )}
      </div>

      <Field label="Name">
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={INPUT} placeholder="Display name" />
      </Field>

      {needs.includes("apiKey") && (
        <Field label="API key">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your API key"
            className={INPUT}
            autoComplete="off"
          />
        </Field>
      )}
      {needs.includes("baseUrl") && (
        <Field label="Base URL">
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={INPUT} placeholder="https://…" />
        </Field>
      )}
      {needs.includes("model") && (
        <Field label="Model">
          <input value={model} onChange={(e) => setModel(e.target.value)} className={INPUT} placeholder="model id" />
        </Field>
      )}
      {needs.includes("command") && (
        <Field label="Command">
          <input value={command} onChange={(e) => setCommand(e.target.value)} className={`${INPUT} font-mono`} placeholder="claude" />
        </Field>
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => void save()} disabled={saving} className={`${BTN} ${BTN_ACTIVE} disabled:opacity-50`}>
          {saving ? "Adding…" : "Add model"}
        </button>
        <button onClick={onDone} className={`${BTN} ${BTN_IDLE}`}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// ---- 2. Working directory ---------------------------------------------
function WorkingDirSection() {
  const { settings, updateSettings, platform } = useFriday();
  const [cwd, setCwd] = useState(settings.cwd);
  const [saving, setSaving] = useState(false);
  const examplePath = platform === "win32" ? "C:\\Users\\you\\project" : "/home/you/project";

  // keep local input in sync if settings change underneath us
  useEffect(() => {
    setCwd(settings.cwd);
  }, [settings.cwd]);

  const dirty = cwd !== settings.cwd;

  async function save() {
    setSaving(true);
    try {
      await updateSettings({ cwd });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <SectionLabel>Working directory</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">The project Friday reads and edits.</p>
      </div>
      <div className="flex items-center gap-2">
        <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder={examplePath} className={`${INPUT} font-mono`} />
        <button onClick={() => void save()} disabled={!dirty || saving} className={`${BTN} ${dirty ? BTN_ACTIVE : BTN_IDLE} shrink-0 disabled:opacity-50`}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

// ---- 2b. Local models (managed by Friday) ------------------------------
function LocalModelsSection() {
  const [data, setData] = useState<LocalModels | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { api.getLocalModels().then(setData).catch(() => {}); }, []);
  if (!data) return null;

  const remove = async (name: string) => {
    setBusy(name);
    try { setData(await api.removeLocalModel(name)); } finally { setBusy(null); }
  };

  return (
    <section className="space-y-3">
      <div>
        <SectionLabel>Local models</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          Installed on this machine, managed by Friday. Engine:{" "}
          <span className={data.running ? "text-accent" : "text-muted-foreground"}>{data.running ? "running" : "stopped"}</span>. Add more from The Barn.
        </p>
      </div>
      {data.models.length === 0 ? (
        <div className="rounded-sm border border-border bg-card px-3 py-4 text-center text-xs text-muted-foreground">No local models installed yet.</div>
      ) : (
        <div className="space-y-2">
          {data.models.map((m) => (
            <div key={m.name} className="flex items-center gap-3 rounded-sm border border-border bg-card px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{m.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{m.sizeGB} GB</span>
              <button
                onClick={() => void remove(m.name)}
                disabled={busy === m.name}
                className="shrink-0 rounded-sm border border-border px-2 py-1 text-[10px] font-medium uppercase tracking-bespoke-caps text-muted-foreground transition-colors hover:border-red-400/50 hover:text-red-400 disabled:opacity-50"
              >
                {busy === m.name ? "Removing…" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---- 3. Permissions ----------------------------------------------------
const PERMISSION_MODES: { mode: PermissionMode; label: string; desc: string }[] = [
  { mode: "plan", label: "Plan", desc: "Read-only. Friday plans but never writes or runs." },
  { mode: "ask", label: "Ask", desc: "Confirm every edit and command before it happens." },
  { mode: "auto-edit", label: "Auto-edit", desc: "Auto-apply file edits; still confirm shell commands." },
  { mode: "auto", label: "Full-auto", desc: "Full autonomy - edits and commands without asking." },
];

function PermissionsSection() {
  const { settings, updateSettings } = useFriday();
  const current = settings.permissionMode;
  const desc = PERMISSION_MODES.find((m) => m.mode === current)?.desc ?? "";

  return (
    <section className="space-y-3">
      <SectionLabel>Autonomy</SectionLabel>
      <div className="inline-flex rounded-sm border border-border bg-secondary p-0.5">
        {PERMISSION_MODES.map((m) => (
          <button
            key={m.mode}
            onClick={() => void updateSettings({ permissionMode: m.mode })}
            className={`px-3 py-1.5 text-xs font-medium uppercase tracking-bespoke-caps rounded-sm transition-colors ${
              current === m.mode ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </section>
  );
}

// ---- 5. Remote (WhatsApp) ----------------------------------------------
const REMOTE_AUTONOMY: { v: RemoteSettings["autonomy"]; label: string }[] = [
  { v: "plan", label: "Plan (read-only)" },
  { v: "ask", label: "Ask (confirm by reply)" },
  { v: "auto-edit", label: "Auto-edit" },
];

function RemoteSection() {
  const [remote, setRemote] = useState<RemoteState | null>(null);
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState("");
  const [sim, setSim] = useState("");
  const [simReply, setSimReply] = useState<string | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  useEffect(() => {
    api.getRemote().then((r) => { setRemote(r); setPhone(r.settings.phone); setToken(r.settings.telegramToken ?? ""); }).catch(() => {});
  }, []);

  const settings = remote?.settings ?? { enabled: false, phone: "", autonomy: "ask" as const, channel: "telegram" as const };
  const channel = settings.channel ?? "telegram";
  const tg = remote?.telegram ?? { state: "off" as const };
  const wa = remote?.whatsapp ?? { state: "off" as const };

  useEffect(() => {
    const active = channel === "telegram" ? tg.state : wa.state;
    if (!["installing", "starting", "qr", "code"].includes(active)) return;
    const t = setInterval(() => {
      (channel === "telegram" ? api.telegramStatus() : api.remoteStatus())
        .then((s) => setRemote((r) => (r ? ({ ...r, [channel]: s } as RemoteState) : r))).catch(() => {});
    }, 2500);
    return () => clearInterval(t);
  }, [channel, tg.state, wa.state]);

  const save = async (patch: Partial<RemoteSettings>) => { setRemote(await api.setRemote(patch)); };
  const runSim = async () => {
    if (!sim.trim()) return;
    setSimBusy(true); setSimReply(null);
    try { setSimReply((await api.remoteSimulate(sim.trim())).reply); }
    catch (e) { setSimReply(String((e as Error).message || e)); }
    finally { setSimBusy(false); }
  };

  return (
    <section className="space-y-3">
      <div>
        <SectionLabel>Remote · chat from your phone</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">Drive Friday while you're away. Locked to you; remote autonomy is capped (never full-auto).</p>
      </div>

      {/* channel */}
      <div className="inline-flex rounded-sm border border-border bg-secondary p-0.5">
        {([["telegram", "Telegram · free"], ["whatsapp", "WhatsApp · beta"]] as const).map(([c, label]) => (
          <button key={c} onClick={() => void save({ channel: c })}
            className={`px-3 py-1.5 text-[11px] font-medium uppercase tracking-bespoke-caps rounded-sm transition-colors ${channel === c ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* enable + autonomy */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => void save({ enabled: !settings.enabled })} className={`${BTN} ${settings.enabled ? BTN_ACTIVE : BTN_IDLE}`}>
          {settings.enabled ? "Remote: On" : "Remote: Off"}
        </button>
        <div className="inline-flex rounded-sm border border-border bg-secondary p-0.5">
          {REMOTE_AUTONOMY.map((m) => (
            <button key={m.v} onClick={() => void save({ autonomy: m.v })}
              className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-bespoke-caps rounded-sm transition-colors ${settings.autonomy === m.v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {channel === "telegram" ? (
        <div className="space-y-2.5 rounded-sm border border-border bg-card p-3">
          <div className="text-[11px] leading-relaxed text-muted-foreground">
            In Telegram open <span className="text-foreground">@BotFather</span> → <span className="font-mono">/newbot</span>, name it "Friday" and set its photo (your logo). Paste the token, Connect, then open your bot and send <span className="font-mono">/start</span> to pair. Free, official, nothing else to set up.
          </div>
          <Field label="Bot token">
            <div className="flex items-center gap-2">
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456:ABC-DEF…" className={`${INPUT} font-mono`} autoComplete="off" />
              <button onClick={() => void save({ telegramToken: token })} disabled={token === (settings.telegramToken ?? "")} className={`${BTN} ${token !== (settings.telegramToken ?? "") ? BTN_ACTIVE : BTN_IDLE} shrink-0 disabled:opacity-50`}>Save</button>
            </div>
          </Field>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-foreground">
              Connection: <span className={tg.state === "connected" ? "text-accent" : tg.state === "error" ? "text-red-400" : "text-muted-foreground"}>{tg.state}</span>
              {tg.bot ? <span className="text-muted-foreground/70"> · @{tg.bot}</span> : null}
              {tg.owner ? <span className="text-muted-foreground/70"> · paired</span> : null}
            </span>
            {tg.state === "connected"
              ? <button onClick={() => api.telegramDisconnect().then((s) => setRemote((r) => (r ? { ...r, telegram: s } : r)))} className={`${BTN} ${BTN_IDLE}`}>Disconnect</button>
              : <button onClick={() => api.telegramConnect().then((s) => setRemote((r) => (r ? { ...r, telegram: s } : r)))} className={`${BTN} ${BTN_ACTIVE}`}>Connect</button>}
          </div>
          {tg.error && <div className="text-[11px] text-red-400">{tg.error}</div>}
          {tg.state === "connected" && tg.bot && (
            <a href={`https://t.me/${tg.bot}`} target="_blank" rel="noreferrer" className="text-[11px] text-accent underline underline-offset-2">Open t.me/{tg.bot} → send /start</a>
          )}
        </div>
      ) : (
        <div className="space-y-2.5 rounded-sm border border-border bg-card p-3">
          <div className="text-[11px] leading-relaxed text-muted-foreground">
            Link a WhatsApp account by QR; Friday posts an update after every step. Each chat is its own conversation.
            <span className="mt-1 block text-muted-foreground/80">
              <span className="text-foreground">Own number:</span> message your “Message yourself” chat.
              <span className="text-foreground"> Dedicated number</span> (recommended): scan with a second WhatsApp, then make a group with it and you — that group becomes a Friday conversation. Only your number (set below) can drive it.
            </span>
          </div>
          <Field label="Your WhatsApp number (the owner allowed to command Friday)">
            <div className="flex items-center gap-2">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" className={`${INPUT} font-mono`} />
              <button onClick={() => void save({ phone })} disabled={phone === settings.phone} className={`${BTN} ${phone !== settings.phone ? BTN_ACTIVE : BTN_IDLE} shrink-0 disabled:opacity-50`}>Save</button>
            </div>
          </Field>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-foreground">
              Connection: <span className={wa.state === "connected" ? "text-accent" : wa.state === "error" ? "text-red-400" : "text-muted-foreground"}>{wa.state}</span>
              {wa.me ? <span className="text-muted-foreground/70"> · {wa.me}</span> : null}
            </span>
            {wa.state === "off" || wa.state === "error"
              ? <div className="flex items-center gap-2">
                  <button
                    onClick={() => api.remoteConnect(phone.trim() || undefined).then((s) => setRemote((r) => (r ? { ...r, whatsapp: s } : r)))}
                    disabled={!phone.trim()}
                    title={phone.trim() ? "Get an 8-character code to enter in WhatsApp" : "Enter your number above first"}
                    className={`${BTN} ${BTN_ACTIVE} disabled:opacity-50`}
                  >Link by code</button>
                  <button onClick={() => api.remoteConnect().then((s) => setRemote((r) => (r ? { ...r, whatsapp: s } : r)))} className={`${BTN} ${BTN_IDLE}`}>Use QR</button>
                </div>
              : wa.state === "connected"
                ? <button onClick={() => api.remoteDisconnect().then((s) => setRemote((r) => (r ? { ...r, whatsapp: s } : r)))} className={`${BTN} ${BTN_IDLE}`}>Disconnect</button>
                : <span className="text-[11px] text-muted-foreground">{wa.state === "installing" ? "Installing…" : wa.state === "qr" ? "Scan QR →" : wa.state === "code" ? "Enter code →" : "Starting…"}</span>}
          </div>
          {wa.error && <div className="text-[11px] text-red-400">{wa.error}</div>}
          {wa.state === "code" && wa.code && (
            <div className="rounded-sm border border-accent/40 bg-accent/5 p-3">
              <div className="font-mono text-2xl tracking-[0.3em] text-foreground">{wa.code}</div>
              <div className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                On your phone: WhatsApp → <span className="text-foreground">Linked devices</span> → <span className="text-foreground">Link a device</span> → <span className="text-foreground">Link with phone number instead</span> → enter this code. It expires in a few minutes; reconnect for a fresh one.
              </div>
            </div>
          )}
          {wa.state === "qr" && wa.qr && (
            <div className="flex items-center gap-3">
              {wa.qr.startsWith("data:")
                ? <img src={wa.qr} alt="WhatsApp QR" className="h-40 w-40 rounded-sm border border-border bg-white p-1" />
                : <pre className="max-h-40 overflow-auto rounded-sm border border-border bg-background p-2 text-[8px] leading-none">{wa.qr}</pre>}
              <div className="text-[11px] text-muted-foreground">WhatsApp → <span className="text-foreground">Linked devices</span> → Link a device → scan. Then message the “Message yourself” chat, or add this number to a group with you.</div>
            </div>
          )}
        </div>
      )}

      {/* simulate (works without connecting) */}
      <div className="rounded-sm border border-border bg-card p-3 space-y-2">
        <div className="text-[10px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">Try it (simulate a message)</div>
        <div className="flex items-center gap-2">
          <input value={sim} onChange={(e) => setSim(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runSim(); }} placeholder="e.g. what files are in this repo?" className={INPUT} />
          <button onClick={() => void runSim()} disabled={simBusy || !sim.trim()} className={`${BTN} ${BTN_ACTIVE} shrink-0 disabled:opacity-50`}>{simBusy ? "…" : "Send"}</button>
        </div>
        {simReply != null && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-background p-2 text-[11px] text-foreground">{simReply}</pre>}
        <p className="text-[10px] text-muted-foreground/70">Runs through the same bridge as the live channels (gated actions are skipped in the tester).</p>
      </div>
    </section>
  );
}

// ---- 4. Appearance -----------------------------------------------------
function AppearanceSection() {
  const { settings, updateSettings } = useFriday();
  const accent = settings.accent ?? { h: 180, s: 70, l: 45 };
  const activePreset = matchPreset(accent);
  const mode = settings.mode ?? "dark";

  return (
    <section className="space-y-4">
      <SectionLabel>Appearance</SectionLabel>

      <div className="space-y-2">
        <span className="text-[10px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">Accent</span>
        <div className="flex flex-wrap gap-2">
          {THEME_COLORS.map((c) => {
            const active = activePreset?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => void updateSettings({ accent: { h: c.h, s: c.s, l: c.l } })}
                title={c.name}
                aria-label={c.name}
                className={`h-8 w-8 rounded-full border transition-transform hover:scale-105 ${
                  active ? "border-accent ring-2 ring-accent ring-offset-2 ring-offset-background" : "border-border"
                }`}
                style={{ background: `hsl(${c.h} ${c.s}% ${c.l}%)` }}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">Hue</span>
        <input
          type="range"
          min={0}
          max={360}
          value={accent.h}
          onChange={(e) => void updateSettings({ accent: { h: Number(e.target.value), s: 70, l: 48 } })}
          className="w-full accent-[hsl(var(--accent))]"
          style={{
            background: "linear-gradient(to right, hsl(0 70% 48%), hsl(60 70% 48%), hsl(120 70% 48%), hsl(180 70% 48%), hsl(240 70% 48%), hsl(300 70% 48%), hsl(360 70% 48%))",
            borderRadius: "9999px",
          }}
        />
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">Mode</span>
        <div className="inline-flex rounded-sm border border-border bg-secondary p-0.5">
          {(["dark", "light"] as const).map((m) => (
            <button
              key={m}
              onClick={() => void updateSettings({ mode: m })}
              className={`px-4 py-1.5 text-xs font-medium uppercase tracking-bespoke-caps rounded-sm transition-colors ${
                mode === m ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
