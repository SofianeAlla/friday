import type { Provider } from "../providers/types.ts";

// Generate a short conversation title (like Claude Code) with a tiny model call.
// Only used with API providers (anthropic/openai); CLI providers delegate tools
// and we don't spend an extra CLI run on a title.
export async function generateTitle(provider: Provider, userText: string, signal: AbortSignal): Promise<string | null> {
  if (provider.delegatesTools) return null;
  const system = "You write a concise 2-5 word title for a coding conversation. Output ONLY the title - no quotes, no trailing punctuation, in Title Case.";
  const msg = `First message of the conversation:\n${userText.slice(0, 800)}\n\nReply with the title only.`;
  let text = "";
  try {
    for await (const ev of provider.run({ system, messages: [{ role: "user", content: [{ type: "text", text: msg }] }], tools: [], signal })) {
      if (ev.type === "text") text += ev.delta;
      else if (ev.type === "error") return null;
      if (text.length > 90) break;
    }
  } catch { return null; }
  const t = text.trim().split("\n")[0].replace(/^["'#\s]+|["'.\s]+$/g, "").slice(0, 60);
  return t || null;
}
