// ProviderSwitcher - THE headline feature. Switch the model mid-conversation
// without losing context. A button surfaces the active provider (channel badge,
// label, model) and opens a dropdown of every provider; configured ones are
// selectable, the active one highlighted, unconfigured ones dimmed.

import { useEffect, useRef, useState } from "react";
import { useFriday } from "@/store";
import { CHANNEL_LABEL } from "@/lib/brand";
import { ModelLogo, familyForProvider } from "@/components/ModelLogo";
import type { ProviderConfig } from "@/lib/api";

function channelOf(p: ProviderConfig): "api" | "cli" | "local" {
  if (p.kind === "cli") return "cli";
  // local providers (e.g. Ollama) typically point at a localhost baseUrl.
  if (p.baseUrl && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(p.baseUrl)) return "local";
  return "api";
}

function ChannelBadge({ channel }: { channel: "api" | "cli" | "local" }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ProviderSwitcher() {
  const { providers, activeProvider, setActive, setSettingsOpen } = useFriday();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeChannel = activeProvider ? channelOf(activeProvider) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-left transition-colors ${
          open ? "border-accent bg-secondary" : "border-border bg-secondary hover:border-accent"
        }`}
      >
        {activeProvider && <ModelLogo family={familyForProvider(activeProvider)} size={18} label={activeProvider.label} />}
        {activeChannel && <ChannelBadge channel={activeChannel} />}
        {activeProvider ? (
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-xs font-medium text-foreground">{activeProvider.label}</span>
            {activeProvider.model && (
              <span className="truncate text-[11px] text-muted-foreground tabular-nums">{activeProvider.model}</span>
            )}
          </span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Select a model</span>
        )}
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 min-w-72 rounded-md border border-border bg-card shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-bespoke-caps text-accent">Models</span>
          </div>

          <div className="max-h-80 overflow-y-auto py-1">
            {providers.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground">No models yet - add one to get started.</div>
            )}
            {providers.map((p) => {
              const isActive = activeProvider?.id === p.id;
              const configured = p.configured !== false;
              const channel = channelOf(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  disabled={!configured}
                  onClick={() => {
                    if (!configured) return;
                    void setActive(p.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                    isActive
                      ? "bg-accent/10 text-foreground"
                      : configured
                        ? "text-foreground hover:bg-secondary"
                        : "cursor-not-allowed opacity-50"
                  }`}
                >
                  <span className={`grid h-4 w-4 shrink-0 place-items-center ${isActive ? "text-accent" : "text-transparent"}`}>
                    {isActive && <CheckIcon />}
                  </span>
                  <ModelLogo family={familyForProvider(p)} size={18} label={p.label} />
                  <ChannelBadge channel={channel} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium">{p.label}</span>
                    {p.model && (
                      <span className="truncate text-[11px] text-muted-foreground tabular-nums">{p.model}</span>
                    )}
                  </span>
                  {!configured && (
                    <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">
                      needs setup
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              setSettingsOpen(true);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <PlusIcon />
            Add or manage models
          </button>

          <div className="border-t border-border px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Switching keeps the full conversation - your new model picks up exactly where the last one left off.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
