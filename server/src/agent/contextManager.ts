// Smart compaction — fit a long, model-neutral transcript into whatever context
// window the *currently active* model has, WITHOUT mutating the stored transcript.
//
// The stored conversation always stays full. This produces a fitted *view* for
// one model call: the most recent turns verbatim, with everything older folded
// into a running summary injected as background context. Switch back to a
// larger model and the next turn sees the complete history again — the summary
// is just a cache. This is what keeps model-switching from causing amnesia even
// when you drop from a 1M-context model to a 32K local one.

import type { Message } from "../providers/types.ts";

const CHARS_PER_TOKEN = 4; // rough heuristic; we add safety margin on top

export function estTextTokens(s: string | undefined): number {
  return Math.ceil((s?.length ?? 0) / CHARS_PER_TOKEN);
}
export function estMessageTokens(m: Message): number {
  let c = 0;
  for (const b of m.content) {
    if (b.type === "text") c += b.text.length;
    else if (b.type === "tool_use") c += b.name.length + JSON.stringify(b.input).length + 8;
    else if (b.type === "tool_result") c += b.content.length + 8;
  }
  return Math.ceil(c / CHARS_PER_TOKEN) + 4; // + role/format overhead
}
export function estTokens(msgs: Message[]): number {
  return msgs.reduce((a, m) => a + estMessageTokens(m), 0);
}

/** Cached running summary of the leading `throughIndex` messages of a conversation. */
export interface Compaction { throughIndex: number; text: string; }

export interface FitOptions {
  window: number; // active model's context window (tokens)
  systemTokens: number; // est tokens of the base system prompt
  reserveOutput: number; // tokens to leave for the model's response
  summarize: (running: string, chunk: Message[]) => Promise<string>;
  cache?: Compaction | null;
  onCache?: (c: Compaction) => void;
}

export interface FitResult {
  systemAddendum: string; // append to the system prompt ("" when nothing was compacted)
  messages: Message[]; // the fitted view to send to the model
  compacted: boolean;
  throughIndex: number; // how many leading messages were summarized away
  note: string; // human-readable, surfaced in the UI
}

// A clean turn boundary: a user message that is plain text (not a tool_result
// carrier). Cutting here guarantees we never split a tool_use/tool_result pair.
function isCleanUserBoundary(m: Message): boolean {
  return m.role === "user" && m.content.length > 0 && m.content.every((b) => b.type === "text");
}

/** Render messages to compact text for the summarizer's input. */
export function renderForSummary(msgs: Message[]): string {
  const parts: string[] = [];
  for (const m of msgs) {
    for (const b of m.content) {
      if (b.type === "text") parts.push(`${m.role.toUpperCase()}: ${b.text}`);
      else if (b.type === "tool_use") parts.push(`${m.role.toUpperCase()} called ${b.name}(${JSON.stringify(b.input).slice(0, 400)})`);
      else if (b.type === "tool_result") parts.push(`TOOL RESULT${b.is_error ? " (error)" : ""}: ${b.content.slice(0, 800)}`);
    }
  }
  return parts.join("\n");
}

// Non-destructive copy that caps oversized tool_result blocks so a single giant
// output can't blow the window even after head-summarization.
function clampResults(msgs: Message[], maxResultChars: number): Message[] {
  return msgs.map((m) => ({
    role: m.role,
    providerId: m.providerId,
    providerLabel: m.providerLabel,
    content: m.content.map((b) =>
      b.type === "tool_result" && b.content.length > maxResultChars
        ? { ...b, content: b.content.slice(0, maxResultChars) + `\n…[${b.content.length - maxResultChars} chars truncated to fit context]` }
        : b,
    ),
  }));
}

/**
 * Fit `full` to the active model's window. Returns the original list unchanged
 * when it already fits (the common case for large-window models). Otherwise
 * keeps a recent verbatim tail and summarizes the head incrementally.
 */
export async function fitToWindow(full: Message[], opts: FitOptions): Promise<FitResult> {
  const safety = Math.ceil(opts.window * 0.05);
  const budget = Math.max(1, opts.window - opts.reserveOutput - opts.systemTokens - safety);
  const none: FitResult = { systemAddendum: "", messages: full, compacted: false, throughIndex: 0, note: "" };

  if (estTokens(full) <= budget) return none;

  // Choose the most recent messages that fit ~60% of the budget for verbatim recall.
  const tailBudget = Math.max(1, Math.floor(budget * 0.6));
  let i = full.length, acc = 0;
  while (i > 0) {
    const t = estMessageTokens(full[i - 1]);
    if (acc + t > tailBudget) break;
    acc += t; i--;
  }
  // Snap the cut to a clean boundary so tool pairs are never split.
  let cut = i;
  while (cut < full.length && !isCleanUserBoundary(full[cut])) cut++;
  if (cut >= full.length) {
    let back = i;
    while (back > 0 && !isCleanUserBoundary(full[back])) back--;
    cut = back;
  }
  if (cut <= 0) return none; // no safe boundary — let the provider deal with it

  const head = full.slice(0, cut);

  // Build/extend the running summary incrementally over the head.
  let summary = "";
  let from = 0;
  if (opts.cache && opts.cache.throughIndex > 0 && opts.cache.throughIndex <= cut) {
    summary = opts.cache.text;
    from = opts.cache.throughIndex;
  }
  const chunkBudget = Math.max(1, Math.floor(budget * 0.4));
  let ci = from;
  while (ci < cut) {
    let cj = ci, csz = 0;
    while (cj < cut) {
      const t = estMessageTokens(head[cj]);
      if (csz + t > chunkBudget && cj > ci) break;
      csz += t; cj++;
    }
    summary = await opts.summarize(summary, head.slice(ci, cj));
    ci = cj;
  }
  opts.onCache?.({ throughIndex: cut, text: summary });

  const maxResultChars = Math.max(4000, Math.floor(budget * 0.25) * CHARS_PER_TOKEN);
  const tail = clampResults(full.slice(cut), maxResultChars);

  const winK = Math.round(opts.window / 1000);
  const note = `Earlier messages were summarized to fit this model's ${winK}K context. Full history is preserved and restored if you switch to a larger model.`;
  const systemAddendum = `\n\n<conversation_summary>\n${summary}\n</conversation_summary>\nThe block above summarizes earlier turns that were compacted to fit the context window. Treat it as established, factual context for the conversation.`;
  return { systemAddendum, messages: tail, compacted: true, throughIndex: cut, note };
}
