// Friday brand identity. Visual language inherited from Marshmallow (Bespoke AI):
// warm-dark beige, Instrument Serif display, uppercase tracked caps. Friday's own
// twist is the Iron-Man arc-reactor mark and a recolourable accent.

export const APP_NAME = "Friday";
export const APP_TAGLINE = "Your coding agent, on call.";
export const APP_SUBTITLE = "Bring any model. Switch mid-task. Keep the context.";

// "F.R.I.D.A.Y." - Tony Stark's AI after JARVIS. We keep the backronym as a wink.
export const APP_BACKRONYM = "Female Replacement Intelligent Digital Assistant Youth";

/** Accent colour presets (HSL). The accent recolours the entire app live. */
export interface ThemeColor {
  id: string;
  name: string;
  h: number;
  s: number;
  l: number;
}

export const THEME_COLORS: ThemeColor[] = [
  { id: "arc-cyan", name: "Arc Reactor", h: 180, s: 70, l: 45 },
  { id: "stark-gold", name: "Stark Gold", h: 42, s: 90, l: 55 },
  { id: "repulsor", name: "Repulsor Blue", h: 205, s: 85, l: 56 },
  { id: "hot-rod", name: "Hot-Rod Red", h: 2, s: 78, l: 55 },
  { id: "mark-iii", name: "Mark III", h: 14, s: 80, l: 52 },
  { id: "ultron", name: "Ultron", h: 268, s: 60, l: 60 },
  { id: "jarvis", name: "JARVIS Teal", h: 168, s: 64, l: 46 },
  { id: "lime", name: "Reactor Lime", h: 96, s: 60, l: 48 },
];

export const DEFAULT_THEME_COLOR = THEME_COLORS[0];

export const CHANNEL_LABEL: Record<string, string> = {
  api: "API",
  cli: "CLI",
  local: "Local",
};
