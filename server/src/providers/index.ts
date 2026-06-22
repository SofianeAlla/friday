import type { Provider, ProviderConfig } from "./types.ts";
import { createAnthropicProvider } from "./anthropic.ts";
import { createOpenAIProvider } from "./openaiCompatible.ts";
import { createCliProvider } from "./cli.ts";

export * from "./types.ts";
export { PRESETS, getPreset } from "./catalog.ts";

/** Build a live provider from its saved config. */
export function buildProvider(cfg: ProviderConfig): Provider {
  switch (cfg.kind) {
    case "anthropic": return createAnthropicProvider(cfg);
    case "openai": return createOpenAIProvider(cfg);
    case "cli": return createCliProvider(cfg);
    default: throw new Error(`Unknown provider kind: ${(cfg as ProviderConfig).kind}`);
  }
}

export function channelOf(cfg: ProviderConfig): "api" | "cli" | "local" {
  if (cfg.kind === "cli") {
    return /ollama|localhost|127\.0\.0\.1|local/i.test(cfg.command || "") ? "local" : "cli";
  }
  return "api";
}

/** Whether this provider's API exposes a reasoning-effort control we can drive. */
export function supportsEffort(cfg: ProviderConfig): boolean {
  const m = (cfg.model || "").toLowerCase();
  if (cfg.kind === "anthropic") return /opus-4-[6-9]|sonnet-4-[6-9]|fable|mythos/.test(m) || m === "" || m.startsWith("claude-opus");
  if (cfg.kind === "openai") {
    return /gpt-5|o[1-9]-|grok-4|grok-build|gemini-3|mistral-medium|magistral|qwen3|deepseek-v4|glm-5|minimax-m|kimi-k2/.test(m);
  }
  return false; // cli/local agents run their own reasoning config
}
