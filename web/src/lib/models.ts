import { familyForProvider } from "@/components/ModelLogo";
import type { ProviderConfig } from "@/lib/api";

// Known, current model ids per family (verified 2026-06-16). Used to populate the
// model switcher - for API providers AND CLIs like Claude Code (which take --model).
// You can always type a custom id too.
const BY_FAMILY: Record<string, string[]> = {
  anthropic: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-opus-4-7"],
  openai: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-mini"],
  gemini: ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-2.5-pro"],
  xai: ["grok-4.3", "grok-build-0.1"],
  mistral: ["mistral-medium-2604", "devstral-2512", "codestral-2508", "mistral-large-2512"],
  deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
  qwen: ["qwen3-coder-plus", "qwen3-coder-flash", "qwen2.5-coder-32b-instruct"],
  zai: ["glm-5.2", "glm-5-turbo", "glm-4.6"],
  moonshot: ["kimi-k2.7-code", "kimi-k2.6", "kimi-k2.5"],
  minimax: ["MiniMax-M3", "MiniMax-M2.7"],
};

export function modelOptions(p: ProviderConfig | null): string[] {
  if (!p) return [];
  // Local Ollama models: the "model" is the pulled tag, not a cloud model swap.
  if (p.kind === "cli" && /ollama/i.test(p.command || "")) return [];
  return BY_FAMILY[familyForProvider(p)] ?? [];
}
