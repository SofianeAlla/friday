// Per-model brand marks. These are original, simplified SVG glyphs (recognisable
// by colour + motif, not pixel-perfect official logos) so they ship offline with
// no network or asset dependency. Keyed by a "family" string used across The Barn,
// Benchmarks, the provider switcher and settings.

import type { ProviderConfig } from "@/lib/api";

export type Family =
  | "anthropic" | "openai" | "gemini" | "mistral" | "qwen"
  | "deepseek" | "zai" | "moonshot" | "minimax" | "xai" | "ollama" | "meta" | "generic";

/** Infer a logo family from a configured provider's fields. */
export function familyForProvider(p: Pick<ProviderConfig, "kind" | "label" | "model" | "baseUrl" | "command" | "preset">): Family {
  const hay = [p.preset, p.label, p.model, p.baseUrl, p.command].filter(Boolean).join(" ").toLowerCase();
  if (/anthropic|claude/.test(hay)) return "anthropic";
  if (/deepseek/.test(hay)) return "deepseek";
  if (/qwen|dashscope|qwq/.test(hay)) return "qwen";
  if (/mistral|codestral|devstral/.test(hay)) return "mistral";
  if (/gemini|google|generativelanguage/.test(hay)) return "gemini";
  if (/glm|z\.?ai|zhipu/.test(hay)) return "zai";
  if (/kimi|moonshot/.test(hay)) return "moonshot";
  if (/minimax/.test(hay)) return "minimax";
  if (/grok|xai|x\.ai/.test(hay)) return "xai";
  if (/llama|meta/.test(hay)) return "meta";
  if (/gpt|openai|codex|o[34]-/.test(hay)) return "openai";
  if (/ollama/.test(hay)) return "ollama";
  if (p.kind === "anthropic") return "anthropic";
  return "generic";
}

function Wrap({ children, size, bg }: { children: React.ReactNode; size: number; bg?: string }) {
  return (
    <span
      className="inline-grid place-items-center shrink-0 rounded-[5px] overflow-hidden"
      style={{ width: size, height: size, background: bg }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{children}</svg>
    </span>
  );
}

export function ModelLogo({ family, size = 22, label }: { family: Family; size?: number; label?: string }) {
  switch (family) {
    case "anthropic":
      return (
        <Wrap size={size} bg="#1f1b18">
          <g stroke="#d97757" strokeWidth="2.1" strokeLinecap="round">
            <line x1="12" y1="4" x2="12" y2="20" />
            <line x1="5.1" y1="8" x2="18.9" y2="16" />
            <line x1="5.1" y1="16" x2="18.9" y2="8" />
          </g>
        </Wrap>
      );
    case "openai":
      return (
        <Wrap size={size} bg="#0e0e0e">
          <g fill="none" stroke="#10a37f" strokeWidth="1.7" strokeLinejoin="round">
            {Array.from({ length: 6 }).map((_, i) => {
              const a = (i * Math.PI) / 3;
              const x = 12 + Math.cos(a) * 6, y = 12 + Math.sin(a) * 6;
              return <circle key={i} cx={x} cy={y} r="3.4" />;
            })}
          </g>
        </Wrap>
      );
    case "gemini":
      return (
        <Wrap size={size} bg="#0e1116">
          <defs>
            <linearGradient id="gemg" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#4796E3" /><stop offset="55%" stopColor="#9168C0" /><stop offset="100%" stopColor="#D96570" />
            </linearGradient>
          </defs>
          <path d="M12 2c.6 5 4.9 9.4 10 10-5.1.6-9.4 5-10 10-.6-5-4.9-9.4-10-10C7.1 11.4 11.4 7 12 2Z" fill="url(#gemg)" />
        </Wrap>
      );
    case "mistral":
      return (
        <Wrap size={size} bg="#0e0e0e">
          {["#ffd800", "#ffaf00", "#ff8205", "#fa500f", "#e10500"].map((c, i) => (
            <rect key={i} x="3" y={3 + i * 3.6} width="18" height="3.4" fill={c} />
          ))}
        </Wrap>
      );
    case "qwen":
      return (
        <Wrap size={size} bg="#f3f1ff">
          <g fill="none" stroke="#6a5cf6" strokeWidth="2" strokeLinecap="round">
            <path d="M7 8.5 12 5l5 3.5v7L12 19l-5-3.5z" />
            <line x1="12" y1="5" x2="12" y2="12" />
            <line x1="12" y1="12" x2="17" y2="8.6" />
          </g>
        </Wrap>
      );
    case "deepseek":
      return (
        <Wrap size={size} bg="#eef2ff">
          <path d="M4 13c3.5.2 5-1.8 6.4-3.6C12 7.2 14 6 17.5 6.4c1.2.1 2.1.9 2.1.9s-1.3.4-1.6 1.3c-.3 1 .4 1.8.4 1.8s-1.5-.2-2.4.6c-1.6 1.4-2.2 5-6.2 5.4C6.6 16.7 4.6 15 4 13Z" fill="#4d6bfe" />
          <circle cx="15.4" cy="9.2" r="0.9" fill="#fff" />
        </Wrap>
      );
    case "zai":
      return (
        <Wrap size={size} bg="#0b3b3b">
          <g fill="none" stroke="#2fd4c4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 7h10l-10 10h10" />
          </g>
        </Wrap>
      );
    case "moonshot":
      return (
        <Wrap size={size} bg="#0c1230">
          <path d="M16.5 15.5A6 6 0 0 1 9 8a6 6 0 1 0 7.5 7.5Z" fill="#7c8cff" />
        </Wrap>
      );
    case "minimax":
      return (
        <Wrap size={size} bg="#1a0e12">
          <g stroke="#f2415f" strokeWidth="2.1" strokeLinecap="round" fill="none">
            <path d="M5 17V8l3.5 5L12 8l3.5 5L19 8v9" />
          </g>
        </Wrap>
      );
    case "ollama":
      return (
        <Wrap size={size} bg="#0e0e0e">
          <g fill="#e9e4da">
            <ellipse cx="12" cy="14.5" rx="6.2" ry="5" />
            <path d="M7 9.5c-.6-2.4.2-5 .9-5 .8 0 1.3 1.6 1.4 3.2A6.6 6.6 0 0 1 12 7c.6 0 1.2.1 1.7.2.1-1.6.6-3.2 1.4-3.2.7 0 1.5 2.6.9 5" />
          </g>
          <circle cx="9.9" cy="13.5" r="1.05" fill="#0e0e0e" />
          <circle cx="14.1" cy="13.5" r="1.05" fill="#0e0e0e" />
        </Wrap>
      );
    case "xai":
      return (
        <Wrap size={size} bg="#0a0a0a">
          <g stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="17.5" y1="6" x2="11.5" y2="12" />
            <line x1="6.5" y1="18" x2="9.5" y2="14.6" />
          </g>
        </Wrap>
      );
    case "meta":
      return (
        <Wrap size={size} bg="#0e1116">
          <path d="M3 15c1.5-6 4-8 6-3 1.5 3.8 3.5 3.8 5 0 2-5 4.5-3 6 3" fill="none" stroke="#1d82f5" strokeWidth="2.1" strokeLinecap="round" />
        </Wrap>
      );
    default:
      return (
        <Wrap size={size} bg="hsl(var(--accent))">
          <text x="12" y="16.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="hsl(var(--accent-foreground))" fontFamily="DM Sans, sans-serif">
            {(label || "·").slice(0, 1).toUpperCase()}
          </text>
        </Wrap>
      );
  }
}
