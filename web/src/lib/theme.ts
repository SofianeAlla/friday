// Live recolouring. Writes --accent-h/s/l on :root so every accent-* utility,
// ring, focus state and glow updates instantly. Persisted to localStorage and
// (best effort) to the backend settings so it survives reloads.

import { DEFAULT_THEME_COLOR, THEME_COLORS, type ThemeColor } from "./brand";

const LS_KEY = "friday.accent";
const LS_MODE = "friday.mode";

export interface AccentValue {
  h: number;
  s: number;
  l: number;
}

export function applyAccent(a: AccentValue) {
  const root = document.documentElement;
  root.style.setProperty("--accent-h", String(a.h));
  root.style.setProperty("--accent-s", `${a.s}%`);
  root.style.setProperty("--accent-l", `${a.l}%`);
  localStorage.setItem(LS_KEY, JSON.stringify(a));
}

export function loadAccent(): AccentValue {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as AccentValue;
  } catch { /* ignore */ }
  return { h: DEFAULT_THEME_COLOR.h, s: DEFAULT_THEME_COLOR.s, l: DEFAULT_THEME_COLOR.l };
}

export function matchPreset(a: AccentValue): ThemeColor | null {
  return THEME_COLORS.find((c) => c.h === a.h && c.s === a.s && c.l === a.l) ?? null;
}

export type Mode = "dark" | "light";

export function applyMode(mode: Mode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
  localStorage.setItem(LS_MODE, mode);
}

export function loadMode(): Mode {
  return (localStorage.getItem(LS_MODE) as Mode) || "dark";
}

/** Init theme before first paint (called from main.tsx). */
export function initTheme() {
  applyMode(loadMode());
  applyAccent(loadAccent());
}
