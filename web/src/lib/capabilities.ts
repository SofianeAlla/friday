import type { ProviderConfig } from "@/lib/api";

// Mirror of the server's supportsEffort() so the UI can decide whether to show
// the reasoning-effort control without waiting for a chat turn.
export function supportsEffort(p: ProviderConfig | null): boolean {
  if (!p) return false;
  const m = (p.model || "").toLowerCase();
  if (p.kind === "anthropic") return /opus-4-[6-9]|sonnet-4-[6-9]|fable|mythos/.test(m) || m === "" || m.startsWith("claude-opus");
  if (p.kind === "openai") return /gpt-5|o[1-9]-|grok-4|grok-build|gemini-3|mistral-medium|magistral|qwen3|deepseek-v4|glm-5|minimax-m|kimi-k2/.test(m);
  return false;
}
