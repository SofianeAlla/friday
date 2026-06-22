// ThemePopover - live recolouring. A round accent swatch opens a popover with
// THEME_COLORS presets, a hue slider, and a dark/light toggle. Every control
// drives updateSettings({ accent }) / updateSettings({ mode }) so the whole app
// recolours instantly.

import { useEffect, useRef, useState } from "react";
import { useFriday } from "@/store";
import { THEME_COLORS, DEFAULT_THEME_COLOR } from "@/lib/brand";
import { matchPreset } from "@/lib/theme";

export function ThemePopover() {
  const { settings, updateSettings } = useFriday();
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

  const accent = settings.accent ?? { h: DEFAULT_THEME_COLOR.h, s: DEFAULT_THEME_COLOR.s, l: DEFAULT_THEME_COLOR.l };
  const activePreset = matchPreset(accent);
  const mode = settings.mode ?? "dark";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Theme"
        title="Theme"
        className={`h-9 w-9 rounded-full border transition-colors ${open ? "border-accent" : "border-border hover:border-accent"}`}
        style={{ backgroundColor: "hsl(var(--accent))" }}
      />

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-border bg-card p-3 shadow-lg">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-bespoke-caps text-accent">Accent</div>
          <div className="grid grid-cols-4 gap-2">
            {THEME_COLORS.map((c) => {
              const isActive = activePreset?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={isActive}
                  onClick={() => void updateSettings({ accent: { h: c.h, s: c.s, l: c.l } })}
                  className={`h-9 w-9 rounded-full border border-border transition-transform hover:scale-105 ${
                    isActive ? "ring-2 ring-accent ring-offset-2 ring-offset-card" : ""
                  }`}
                  style={{ backgroundColor: `hsl(${c.h} ${c.s}% ${c.l}%)` }}
                />
              );
            })}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">Hue</div>
            <input
              type="range"
              min={0}
              max={360}
              value={Math.round(accent.h)}
              onChange={(e) => void updateSettings({ accent: { h: Number(e.target.value), s: 70, l: 48 } })}
              aria-label="Hue"
              className="h-2 w-full cursor-pointer appearance-none rounded-full"
              style={{
                accentColor: "hsl(var(--accent))",
                background:
                  "linear-gradient(to right, hsl(0 70% 48%), hsl(60 70% 48%), hsl(120 70% 48%), hsl(180 70% 48%), hsl(240 70% 48%), hsl(300 70% 48%), hsl(360 70% 48%))",
              }}
            />
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-bespoke-caps text-muted-foreground">Appearance</div>
            <div className="flex gap-1.5">
              {(["dark", "light"] as const).map((m) => {
                const isActive = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => void updateSettings({ mode: m })}
                    className={`flex-1 rounded-sm border px-3 py-2 text-xs font-medium uppercase tracking-bespoke-caps transition-colors ${
                      isActive
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-secondary text-foreground hover:border-accent"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
