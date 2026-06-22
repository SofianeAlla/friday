// Header - the top bar. Wordmark + arc-reactor logo on the left; on the right
// the ProviderSwitcher (headline feature), a permission-mode segmented control,
// the "dig deeper" code toggle, the ThemePopover, a new-session button, and the
// settings gear. Everything reads/writes through useFriday().

import { useEffect, useState } from "react";
import { useFriday, type View } from "@/store";
import { FridayLogo } from "@/components/FridayLogo";
import { ProviderSwitcher } from "@/components/ProviderSwitcher";
import { ThemePopover } from "@/components/ThemePopover";
import { GitHubMark } from "@/components/GitPanel";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { supportsEffort } from "@/lib/capabilities";
import { api, type Effort, type RemoteStatus, type GitStatus } from "@/lib/api";

const EFFORTS: Effort[] = ["default", "low", "medium", "high", "max"];

const NAV: { view: View; label: string; icon: React.ReactNode }[] = [
  { view: "chat", label: "Vibe Code", icon: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" /></svg>
  ) },
  { view: "barn", label: "The Barn", icon: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M3 10h18M9 21v-7h6v7" /></svg>
  ) },
  { view: "benchmarks", label: "Benchmarks", icon: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="12" y="7" width="3" height="10" /><rect x="17" y="13" width="3" height="4" /></svg>
  ) },
];

function CodeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  );
}

function NewSessionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function WhatsAppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.004c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.02A9.86 9.86 0 0 0 12.04 2Zm0 1.8c2.16 0 4.18.84 5.71 2.37a8.03 8.03 0 0 1 2.37 5.72c0 4.46-3.63 8.1-8.1 8.1a8.2 8.2 0 0 1-4.31-1.23l-.31-.18-3.2.84.85-3.12-.2-.32a8.06 8.06 0 0 1-1.24-4.29c0-4.47 3.64-8.1 8.1-8.1Zm-3.6 4.34c-.17 0-.45.06-.68.31-.23.25-.9.88-.9 2.14 0 1.26.92 2.48 1.05 2.65.13.17 1.8 2.75 4.37 3.86.61.26 1.09.42 1.46.54.61.2 1.17.17 1.61.1.49-.07 1.51-.62 1.72-1.21.21-.6.21-1.11.15-1.21-.06-.11-.23-.17-.48-.3-.25-.13-1.51-.74-1.74-.83-.23-.08-.4-.13-.57.13-.17.25-.65.82-.8.99-.15.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.66-1.25-1.48-1.4-1.73-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.55-1.39-.78-1.9-.2-.45-.4-.39-.55-.4l-.47-.01Z" />
    </svg>
  );
}

const ICON_BTN =
  "h-9 w-9 grid place-items-center rounded-sm border border-border hover:border-accent text-muted-foreground hover:text-foreground transition-colors";

export function Header() {
  const { settings, updateSettings, codePanelOpen, toggleCodePanel, reset, setSettingsOpen, setGitOpen, gitOpen, activeProject, view, setView, activeProvider } = useFriday();
  const showEffort = supportsEffort(activeProvider);

  // Live WhatsApp link status for the header indicator. Cheap poll; decoupled from Settings.
  const [wa, setWa] = useState<RemoteStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.remoteStatus().then((s) => { if (alive) setWa(s); }).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const waConnected = wa?.state === "connected";
  const waLinking = wa?.state === "qr" || wa?.state === "code" || wa?.state === "starting" || wa?.state === "installing";
  const waTitle = waConnected
    ? `WhatsApp: connected${wa?.me ? ` · ${wa.me}` : ""}`
    : waLinking ? "WhatsApp: linking - finish in Settings" : "WhatsApp: not paired - click to set up";

  // Live GitHub/git status for the active project. Re-checks on project change + panel close.
  const [git, setGit] = useState<GitStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.gitStatus().then((s) => { if (alive) setGit(s); }).catch(() => {});
    load();
    const t = setInterval(load, 12000);
    return () => { alive = false; clearInterval(t); };
  }, [activeProject?.id, gitOpen]);
  const gitRepo = !!git?.isRepo;
  const gitConnected = gitRepo && !!git?.remote;
  const gitTitle = git?.gitMissing
    ? "Git not installed"
    : !activeProject ? "GitHub: open a project first"
    : !gitRepo ? "GitHub: not a Git repo - click to set up"
    : gitConnected ? `GitHub: connected · ${git?.branch || "?"}${git?.dirty ? ` · ${git.dirty} change${git.dirty === 1 ? "" : "s"}` : ""}`
    : "GitHub: repo has no remote - click to connect";

  return (
    <header className="h-14 px-5 flex items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar shrink-0">
      <div className="flex items-center gap-3 shrink-0">
        <FridayLogo className="h-8 w-8" />
        <div className="flex flex-col">
          <span className="font-display text-2xl leading-none">{APP_NAME}</span>
          <span className="text-[10px] uppercase tracking-bespoke-caps text-muted-foreground">{APP_TAGLINE}</span>
        </div>
      </div>

      <nav className="flex items-center gap-1 rounded-sm border border-border bg-secondary p-0.5">
        {NAV.map(({ view: v, label, icon }) => {
          const active = view === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[11px] font-medium uppercase tracking-bespoke-caps transition-colors ${
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {icon}
              <span className="hidden md:inline">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 shrink-0">
        <ProviderSwitcher />

        {showEffort && (
          <label
            title="Reasoning effort (this model's API supports it)"
            className="flex items-center gap-1.5 rounded-sm border border-border bg-secondary px-2 py-1"
          >
            <span className="text-[10px] uppercase tracking-bespoke-caps text-muted-foreground">Effort</span>
            <select
              value={settings.effort ?? "default"}
              onChange={(e) => void updateSettings({ effort: e.target.value as Effort })}
              className="bg-transparent text-[11px] font-medium text-foreground outline-none"
            >
              {EFFORTS.map((e) => (
                <option key={e} value={e} className="bg-card text-foreground">{e}</option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          onClick={toggleCodePanel}
          aria-pressed={codePanelOpen}
          title="Dig deeper - show code"
          className={`h-9 w-9 grid place-items-center rounded-sm border transition-colors ${
            codePanelOpen
              ? "bg-accent text-accent-foreground border-accent"
              : "border-border bg-secondary text-muted-foreground hover:border-accent hover:text-foreground"
          }`}
        >
          <CodeIcon />
        </button>

        <ThemePopover />

        <button type="button" onClick={() => setSettingsOpen(true)} title={waTitle} aria-label={waTitle} className={`${ICON_BTN} relative`}>
          <WhatsAppMark className={`h-4 w-4 ${waConnected ? "text-[#25D366]" : ""}`} />
          <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${waConnected ? "bg-[#25D366] animate-pulse" : waLinking ? "bg-amber-400" : "bg-muted-foreground/40"}`} />
        </button>

        <button type="button" onClick={() => setGitOpen(true)} title={gitTitle} aria-label={gitTitle} className={`${ICON_BTN} relative`}>
          <GitHubMark className="h-4 w-4" />
          <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${gitConnected ? "bg-emerald-500" : gitRepo ? "bg-amber-400" : "bg-muted-foreground/40"}`} />
        </button>

        <button type="button" onClick={reset} title="New session" aria-label="New session" className={ICON_BTN}>
          <NewSessionIcon />
        </button>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
          className={ICON_BTN}
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}
