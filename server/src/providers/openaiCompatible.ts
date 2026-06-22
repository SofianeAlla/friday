import type { Message, Provider, ProviderConfig, ProviderEvent, ProviderTurnInput, StopReason } from "./types.ts";
import { streamLines, readError } from "./sse.ts";

// One adapter for every OpenAI-compatible endpoint: OpenAI/Codex, Mistral,
// Gemini (its OpenAI-compat surface), Qwen/DashScope, Ollama's /v1, LM Studio,
// vLLM, etc. Differences are just baseUrl + model + key, so a single class
// covers them all. Canonical <-> OpenAI translation lives here.

const MAX_TOKENS = 8192;

function toOpenAIMessages(system: string, messages: Message[]): any[] {
  const out: any[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("");
      const toolCalls = m.content
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const t = b as any;
          return { id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) } };
        });
      const msg: any = { role: "assistant", content: text || null };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      out.push(msg);
    } else {
      // user role: split into a user text message + one tool message per result
      const texts = m.content.filter((b) => b.type === "text").map((b) => (b as any).text);
      const results = m.content.filter((b) => b.type === "tool_result") as any[];
      if (texts.length) out.push({ role: "user", content: texts.join("\n") });
      for (const r of results) {
        out.push({ role: "tool", tool_call_id: r.tool_use_id, content: r.content });
      }
    }
  }
  return out;
}

function mapStop(reason: string | null | undefined): StopReason {
  switch (reason) {
    case "tool_calls":
    case "function_call": return "tool_use";
    case "length": return "max_tokens";
    case "stop": return "end_turn";
    default: return "end_turn";
  }
}

export function createOpenAIProvider(cfg: ProviderConfig): Provider {
  return {
    id: cfg.id,
    kind: "openai",
    label: cfg.label,
    model: cfg.model,
    delegatesTools: false,
    async *run({ system, messages, tools, signal, effort }: ProviderTurnInput): AsyncGenerator<ProviderEvent> {
      const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      const body: any = {
        model: cfg.model || "gpt-5.5",
        messages: toOpenAIMessages(system, messages),
        max_tokens: MAX_TOKENS,
        stream: true,
        stream_options: { include_usage: true }, // ask for token usage in the final chunk
      };
      // Reasoning models (GPT-5.x, Grok 4, Gemini 3, Mistral Medium 3.5, Qwen3, …)
      // accept reasoning_effort. "max" isn't standard there → clamp to "high".
      if (effort && effort !== "default") {
        body.reasoning_effort = effort === "max" ? "high" : effort;
      }
      if (tools.length) {
        body.tools = tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.input_schema },
        }));
        body.tool_choice = "auto";
      }
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.apiKey || ""}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        yield { type: "error", message: `${cfg.label}: ${await readError(res)}` };
        return;
      }

      // accumulate tool calls by their position index
      const calls = new Map<number, { id: string; name: string; args: string }>();
      let stop: StopReason = "end_turn";
      let sawToolCall = false;

      for await (const line of streamLines(res)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        if (payload === "[DONE]") break;
        let evt: any;
        try { evt = JSON.parse(payload); } catch { continue; }

        const choice = evt.choices?.[0];
        if (evt.usage) {
          yield { type: "usage", inputTokens: evt.usage.prompt_tokens, outputTokens: evt.usage.completion_tokens };
        }
        if (!choice) continue;
        const delta = choice.delta || {};
        if (typeof delta.content === "string" && delta.content) {
          yield { type: "text", delta: delta.content };
        }
        if (Array.isArray(delta.tool_calls)) {
          sawToolCall = true;
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const cur = calls.get(idx) ?? { id: "", name: "", args: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name = tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            calls.set(idx, cur);
          }
        }
        if (choice.finish_reason) stop = mapStop(choice.finish_reason);
      }

      // flush accumulated tool calls
      for (const [, c] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
        let input: Record<string, unknown> = {};
        try { input = c.args ? JSON.parse(c.args) : {}; } catch { input = {}; }
        const id = c.id || `call_${c.name}_${Math.random().toString(36).slice(2, 8)}`;
        yield { type: "tool_use", id, name: c.name, input };
      }
      if (sawToolCall && stop !== "tool_use") stop = "tool_use";
      yield { type: "done", stopReason: stop };
    },
  };
}
