import type { ContentBlock, Message, Provider } from "../providers/types.ts";
import { executeTool, toolTitle, TOOLS, GATED_TOOLS } from "../tools/index.ts";
import type { PermissionRequest, Todo, ToolContext } from "../tools/types.ts";
import { appendMessage, getConversation, setTodos as persistTodos, addUsage, setCompaction } from "../session/store.ts";
import { buildSystemPrompt } from "./systemPrompt.ts";
import { contextWindow } from "../models/pricing.ts";
import { fitToWindow, estTextTokens, renderForSummary } from "./contextManager.ts";
import type { ActiveProviderInfo, AgentEvent, PermissionMode } from "./events.ts";

const OUTPUT_RESERVE = 8192; // matches adapters' max_tokens — leave room for the reply

const MAX_STEPS = 60;

export interface PermissionBroker {
  /** Register a pending request; resolves when the user decides. */
  await(req: PermissionRequest): Promise<boolean>;
}

export interface TurnOptions {
  userText: string;
  provider: Provider;
  providerInfo: ActiveProviderInfo;
  cwd: string;
  conversationId: string;
  permissionMode: PermissionMode;
  effort?: string;
  broker: PermissionBroker;
  emit: (e: AgentEvent) => void;
  signal: AbortSignal;
}

/**
 * One full agent turn: user message in → (model → tools → model → …) → final
 * assistant text. Works identically for any API provider; CLI providers simply
 * stream text and never request tools.
 */
export async function runTurn(opts: TurnOptions): Promise<void> {
  const { provider, providerInfo, cwd, conversationId, permissionMode, effort, broker, emit, signal } = opts;

  // record the user's message in this conversation's provider-neutral transcript
  appendMessage(conversationId, { role: "user", content: [{ type: "text", text: opts.userText }] });

  const baseSystem = buildSystemPrompt(cwd, provider.delegatesTools);
  const tools = provider.delegatesTools ? [] : TOOLS;

  // Smart compaction. Agent CLIs (channel "cli": claude/codex/gemini/vibe) run
  // their own context management, so we leave them alone. For API and local
  // (Ollama) models we fit the provider-neutral transcript to the active
  // model's window — summarizing the oldest turns and keeping recent ones
  // verbatim — without ever mutating the stored transcript.
  const selfManaging = providerInfo.channel === "cli";
  const win = contextWindow(providerInfo.model);
  const baseSystemTokens = estTextTokens(baseSystem);
  let announcedCompaction = false;
  const summarize = async (running: string, chunk: Message[]): Promise<string> => {
    const sys = "You compress a coding-agent conversation into a dense, factual summary. Preserve the user's goals and decisions, files created or edited and why, the current state of the work, commands run and key results, and any unresolved tasks. Keep all concrete identifiers (paths, names, flags). Be terse; do not invent. Output only the summary.";
    const prior = running ? `Summary so far:\n${running}\n\n` : "";
    const body = `${prior}New conversation segment to fold in:\n\n${renderForSummary(chunk)}\n\nReturn the updated, complete summary.`;
    let out = "";
    try {
      for await (const ev of provider.run({ system: sys, messages: [{ role: "user", content: [{ type: "text", text: body }] }], tools: [], signal })) {
        if (ev.type === "text") out += ev.delta;
        else if (ev.type === "error") break;
      }
    } catch { /* fall back to the prior summary */ }
    return out.trim() || running || "(summary unavailable)";
  };

  const ctx: ToolContext = {
    cwd,
    sessionId: conversationId,
    signal,
    setTodos: (todos: Todo[]) => { persistTodos(conversationId, todos); emit({ type: "todos", todos }); },
    requestPermission: async (req: PermissionRequest) => {
      // Autonomy levels: plan = never; auto = always; auto-edit = edits yes, commands ask; ask = confirm all.
      if (permissionMode === "auto") return true;
      if (permissionMode === "plan") return false;
      if (permissionMode === "auto-edit" && req.toolName !== "run_command") return true;
      const id = req.id || `perm_${Math.random().toString(36).slice(2, 9)}`;
      const full = { ...req, id };
      emit({ type: "awaiting_permission", request: full });
      const allowed = await broker.await(full);
      emit({ type: "permission_resolved", id, allowed });
      return allowed;
    },
  };

  let stopReason = "end_turn";

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) { stopReason = "aborted"; break; }
    emit({ type: "assistant_start", provider: providerInfo });

    let textBuf = "";
    const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = [];
    let turnStop = "end_turn";
    let errored = false;
    let stepIn = 0, stepOut = 0; // usage fields arrive as running totals → take max

    const history = getConversation(conversationId)?.messages ?? [];
    let runSystem = baseSystem;
    let runMessages = history;
    if (!selfManaging) {
      const conv = getConversation(conversationId);
      const fit = await fitToWindow(history, {
        window: win,
        systemTokens: baseSystemTokens,
        reserveOutput: OUTPUT_RESERVE,
        summarize,
        cache: conv?.compaction ?? null,
        onCache: (c) => setCompaction(conversationId, c.throughIndex, c.text),
      });
      runSystem = baseSystem + fit.systemAddendum;
      runMessages = fit.messages;
      if (fit.compacted && !announcedCompaction) {
        announcedCompaction = true;
        emit({ type: "compacted", throughIndex: fit.throughIndex, note: fit.note });
      }
    }
    for await (const ev of provider.run({ system: runSystem, messages: runMessages, tools, signal, effort })) {
      switch (ev.type) {
        case "text":
          textBuf += ev.delta;
          emit({ type: "text", delta: ev.delta });
          break;
        case "tool_use":
          toolUses.push({ id: ev.id, name: ev.name, input: ev.input });
          break;
        case "usage":
          stepIn = Math.max(stepIn, ev.inputTokens ?? 0);
          stepOut = Math.max(stepOut, ev.outputTokens ?? 0);
          emit({ type: "usage", inputTokens: ev.inputTokens, outputTokens: ev.outputTokens });
          break;
        case "done":
          turnStop = ev.stopReason;
          break;
        case "error":
          emit({ type: "error", message: ev.message });
          errored = true;
          break;
      }
      if (errored) break;
    }
    if (errored) return;
    if (stepIn || stepOut) addUsage(conversationId, stepIn, stepOut, stepIn);

    // commit the assistant message (text + any tool_use blocks)
    const content: ContentBlock[] = [];
    if (textBuf.trim()) content.push({ type: "text", text: textBuf });
    for (const t of toolUses) content.push({ type: "tool_use", id: t.id, name: t.name, input: t.input });
    if (content.length) {
      const msg: Message = { role: "assistant", content, providerId: providerInfo.id, providerLabel: providerInfo.label };
      appendMessage(conversationId, msg);
      emit({ type: "assistant_committed", message: msg });
    }

    if (!toolUses.length) { stopReason = turnStop; break; }

    // execute tools, gather results into one user message
    const results: ContentBlock[] = [];
    for (const t of toolUses) {
      if (signal.aborted) break;
      emit({ type: "tool_start", id: t.id, name: t.name, title: toolTitle(t.name, t.input), input: t.input });
      const needsGate = GATED_TOOLS.has(t.name);
      const res = await executeTool(t.name, t.input, {
        ...ctx,
        // read-only tools never prompt
        requestPermission: needsGate ? ctx.requestPermission : async () => true,
      });
      emit({
        type: "tool_end", id: t.id, ok: !res.isError,
        resultPreview: res.content.slice(0, 6000), meta: res.meta,
      });
      results.push({ type: "tool_result", tool_use_id: t.id, content: res.content, is_error: res.isError });
    }
    appendMessage(conversationId, { role: "user", content: results });

    if (signal.aborted) { stopReason = "aborted"; break; }
  }

  emit({ type: "turn_done", stopReason });
}
