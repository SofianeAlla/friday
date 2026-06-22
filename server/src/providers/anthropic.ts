import type { Message, Provider, ProviderConfig, ProviderEvent, ProviderTurnInput, StopReason } from "./types.ts";
import { streamLines, readError } from "./sse.ts";

// Anthropic Messages API adapter. The canonical content blocks (text / tool_use
// / tool_result) are already in Anthropic's native shape, so serialisation here
// is essentially the identity - which is exactly why replaying a transcript
// produced under another provider works seamlessly.

const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";
const MAX_TOKENS = 8192;

function toAnthropicMessages(messages: Message[]) {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((b) => {
      if (b.type === "text") return { type: "text", text: b.text };
      if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
      return { type: "tool_result", tool_use_id: b.tool_use_id, content: b.content, is_error: b.is_error };
    }),
  }));
}

function mapStop(reason: string | null | undefined): StopReason {
  switch (reason) {
    case "tool_use": return "tool_use";
    case "max_tokens": return "max_tokens";
    case "end_turn":
    case "stop_sequence": return "end_turn";
    default: return "end_turn";
  }
}

export function createAnthropicProvider(cfg: ProviderConfig): Provider {
  return {
    id: cfg.id,
    kind: "anthropic",
    label: cfg.label,
    model: cfg.model,
    delegatesTools: false,
    async *run({ system, messages, tools, signal, effort }: ProviderTurnInput): AsyncGenerator<ProviderEvent> {
      const body: Record<string, unknown> = {
        model: cfg.model || "claude-opus-4-8",
        max_tokens: MAX_TOKENS,
        system,
        messages: toAnthropicMessages(messages),
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
        stream: true,
      };
      // Opus 4.6+/Fable use output_config.effort with always-on adaptive thinking.
      if (effort && effort !== "default") {
        const e = effort === "max" ? "max" : effort; // low|medium|high|xhigh|max
        body.output_config = { effort: e };
      }
      const res = await fetch(API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey || "",
          "anthropic-version": VERSION,
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        yield { type: "error", message: `Claude: ${await readError(res)}` };
        return;
      }

      // accumulate tool_use input json per content-block index
      const partials = new Map<number, { id: string; name: string; json: string }>();
      let stop: StopReason = "end_turn";

      for await (const line of streamLines(res)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let evt: any;
        try { evt = JSON.parse(payload); } catch { continue; }

        switch (evt.type) {
          case "message_start":
            if (evt.message?.usage?.input_tokens != null) {
              yield { type: "usage", inputTokens: evt.message.usage.input_tokens };
            }
            break;
          case "content_block_start":
            if (evt.content_block?.type === "tool_use") {
              partials.set(evt.index, { id: evt.content_block.id, name: evt.content_block.name, json: "" });
            }
            break;
          case "content_block_delta":
            if (evt.delta?.type === "text_delta") {
              yield { type: "text", delta: evt.delta.text };
            } else if (evt.delta?.type === "input_json_delta") {
              const p = partials.get(evt.index);
              if (p) p.json += evt.delta.partial_json ?? "";
            }
            break;
          case "content_block_stop": {
            const p = partials.get(evt.index);
            if (p) {
              let input: Record<string, unknown> = {};
              try { input = p.json ? JSON.parse(p.json) : {}; } catch { input = {}; }
              yield { type: "tool_use", id: p.id, name: p.name, input };
              partials.delete(evt.index);
            }
            break;
          }
          case "message_delta":
            if (evt.delta?.stop_reason) stop = mapStop(evt.delta.stop_reason);
            if (evt.usage) yield { type: "usage", outputTokens: evt.usage.output_tokens };
            break;
          case "error":
            yield { type: "error", message: `Claude: ${evt.error?.message || "stream error"}` };
            return;
        }
      }
      yield { type: "done", stopReason: stop };
    },
  };
}
