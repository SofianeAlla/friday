// Autonomy level control - Plan / Ask / Auto-edit / Full-auto. Lives in the bottom
// bar below the chat input, like Claude Code's permission-mode indicator.

import { useFriday } from "@/store";
import type { PermissionMode } from "@/lib/api";

const MODES: { mode: PermissionMode; label: string; title: string }[] = [
  { mode: "plan", label: "Plan", title: "Read-only - Friday plans but never writes or runs" },
  { mode: "ask", label: "Ask", title: "Confirm every edit and command" },
  { mode: "auto-edit", label: "Auto-edit", title: "Auto-apply file edits; still confirm shell commands" },
  { mode: "auto", label: "Full-auto", title: "Full autonomy - no prompts" },
];

export function AutonomyToggle() {
  const { settings, updateSettings } = useFriday();
  return (
    <div className="flex items-center gap-1 rounded-sm border border-border bg-secondary p-0.5">
      {MODES.map(({ mode, label, title }) => {
        const active = settings.permissionMode === mode;
        return (
          <button
            key={mode}
            type="button"
            title={title}
            aria-pressed={active}
            onClick={() => void updateSettings({ permissionMode: mode })}
            className={`rounded-sm px-2.5 py-1 text-[11px] font-medium uppercase tracking-bespoke-caps transition-colors ${
              active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
