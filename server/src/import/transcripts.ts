// Import conversations from other coding agents living on this machine.
//
// Claude Code keeps one JSONL transcript per session under
//   ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl
// Codex (OpenAI CLI) keeps "rollout" JSONL files under
//   ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
//
// Both are reverse-engineered here from the real on-disk files and folded into
// Friday's canonical Message model so an imported thread can be read and then
// continued with ANY model, losslessly. We deliberately drop provider-specific
// noise (thinking/reasoning, images, sidechains, instruction preambles, UI
// events) and run an orphan-stripping pass so the transcript stays valid to
// replay (no tool_use without its result, and vice-versa).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Message, ContentBlock } from "../providers/types.ts";

export type ImportSource = "claude" | "codex";

export interface ParsedSession {
  source: ImportSource;
  sourceId: string; // stable id, e.g. "claude:<uuid>" — used for idempotent import
  filePath: string;
  cwd: string; // becomes the Friday project path
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  messageCount: number;
}

// -------------------------------------------------------------- shared helpers

function parseJsonl(file: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  let raw: string;
  try { raw = readFileSync(file, "utf8"); } catch { return out; }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* tolerate partial/corrupt lines */ }
  }
  return out;
}

/** Flatten any "content" shape (string | array of blocks | object) to one string. */
function flattenText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b: any) => {
        if (typeof b === "string") return b;
        if (b && typeof b === "object") return typeof b.text === "string" ? b.text : JSON.stringify(b);
        return String(b);
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content === "object") {
    const o = content as any;
    return typeof o.text === "string" ? o.text : JSON.stringify(content);
  }
  return String(content);
}

/**
 * Drop tool blocks that lost their partner (after skipping sidechains / preambles
 * / reasoning) and any message left empty. Keeps the transcript safe to replay.
 */
function stripOrphanTools(messages: Message[]): Message[] {
  const resultIds = new Set<string>();
  const useIds = new Set<string>();
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type === "tool_result") resultIds.add(b.tool_use_id);
      else if (b.type === "tool_use") useIds.add(b.id);
    }
  }
  const out: Message[] = [];
  for (const m of messages) {
    const content = m.content.filter((b) => {
      if (b.type === "tool_use") return resultIds.has(b.id);
      if (b.type === "tool_result") return useIds.has(b.tool_use_id);
      return true;
    });
    if (content.length) out.push({ role: m.role, content });
  }
  return out;
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 80);

// ------------------------------------------------------------------ Claude Code

function claudeRoot(): string {
  return path.join(homedir(), ".claude", "projects");
}

// message.content -> canonical blocks. thinking is dropped; images become "[image]".
function claudeBlocks(content: unknown, isMeta: boolean): ContentBlock[] {
  if (typeof content === "string") {
    if (isMeta) return []; // caveats / local-command echoes — noise
    return content.trim() ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const out: ContentBlock[] = [];
  for (const b of content as any[]) {
    if (!b || typeof b !== "object") continue;
    switch (b.type) {
      case "text":
        if (typeof b.text === "string" && b.text.trim()) out.push({ type: "text", text: b.text });
        break;
      case "tool_use": {
        // input is usually an object but can arrive as a JSON string.
        let input: Record<string, unknown> = {};
        const raw = b.input;
        if (typeof raw === "string") { try { input = JSON.parse(raw); } catch { input = { raw }; } }
        else if (raw && typeof raw === "object") input = raw;
        out.push({ type: "tool_use", id: String(b.id ?? ""), name: String(b.name ?? "tool"), input });
        break;
      }
      case "tool_result":
        out.push({
          type: "tool_result",
          tool_use_id: String(b.tool_use_id ?? ""),
          content: flattenText(b.content),
          ...(b.is_error === true ? { is_error: true } : {}),
        });
        break;
      case "image":
        out.push({ type: "text", text: "[image]" });
        break;
      // "thinking" and anything else -> dropped
    }
  }
  return out;
}

function parseClaudeFile(file: string): ParsedSession | null {
  const rows = parseJsonl(file);
  if (!rows.length) return null;
  let cwd = "", sessionId = "", aiTitle = "", customTitle = "", firstUserText = "";
  let createdAt = 0, updatedAt = 0;
  const messages: Message[] = [];

  for (const o of rows) {
    const ts = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : NaN;
    if (!Number.isNaN(ts)) { if (!createdAt) createdAt = ts; updatedAt = ts; }
    if (typeof o.sessionId === "string" && !sessionId) sessionId = o.sessionId;
    if (typeof o.cwd === "string" && o.cwd && !cwd) cwd = o.cwd;
    if (o.type === "ai-title" && typeof o.aiTitle === "string" && o.aiTitle.trim()) aiTitle = o.aiTitle.trim(); // keep the latest
    if (o.type === "custom-title" && typeof o.customTitle === "string" && o.customTitle.trim()) customTitle = o.customTitle.trim();

    if (o.type !== "user" && o.type !== "assistant") continue;
    if (o.isSidechain) continue; // subagent threads — keep the main line clean
    const msg = o.message;
    if (!msg) continue;
    const role: Message["role"] = msg.role === "assistant" ? "assistant" : "user";
    const blocks = claudeBlocks(msg.content, o.isMeta === true);
    if (!blocks.length) continue;

    if (role === "user" && !firstUserText) {
      const t = blocks.find((b) => b.type === "text") as { text: string } | undefined;
      if (t && !t.text.trimStart().startsWith("<")) firstUserText = t.text;
    }
    messages.push({ role, content: blocks });
  }

  const clean = stripOrphanTools(messages);
  if (!clean.length || !cwd) return null;
  const id = sessionId || path.basename(file, ".jsonl");
  return {
    source: "claude",
    sourceId: `claude:${id}`,
    filePath: file,
    cwd,
    title: tidy(customTitle || aiTitle || firstUserText || "Imported Claude session"),
    createdAt: createdAt || Date.now(),
    updatedAt: updatedAt || createdAt || Date.now(),
    messages: clean,
    messageCount: clean.length,
  };
}

export function scanClaude(): ParsedSession[] {
  const root = claudeRoot();
  if (!existsSync(root)) return [];
  const sessions: ParsedSession[] = [];
  let dirs: string[] = [];
  try { dirs = readdirSync(root); } catch { return []; }
  for (const d of dirs) {
    const pdir = path.join(root, d);
    let files: string[] = [];
    try { files = readdirSync(pdir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const parsed = parseClaudeFile(path.join(pdir, f));
      if (parsed) sessions.push(parsed);
    }
  }
  return sessions;
}

// ------------------------------------------------------------------------ Codex

function codexRoot(): string {
  return path.join(homedir(), ".codex", "sessions");
}

function isPreamble(text: string): boolean {
  const t = text.trimStart().toLowerCase();
  return t.startsWith("<environment_context") || t.startsWith("<user_instructions")
    || t.startsWith("<permissions") || t.startsWith("<collaboration_mode")
    || t.startsWith("<instructions") || t.startsWith("<skills");
}

// function_call_output.output is usually a plain string, sometimes a JSON
// envelope {"output":"...","metadata":{...}} — pull the human text out.
function codexOutput(output: unknown): string {
  if (output == null) return "";
  if (typeof output === "string") {
    try {
      const j = JSON.parse(output);
      if (j && typeof j === "object" && typeof j.output === "string") return j.output;
    } catch { /* plain string */ }
    return output;
  }
  if (typeof output === "object") {
    const o = output as any;
    if (typeof o.output === "string") return o.output;
    return JSON.stringify(output);
  }
  return String(output);
}

function walkJsonl(dir: string): string[] {
  const out: string[] = [];
  let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[] = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJsonl(p));
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

function parseCodexFile(file: string): ParsedSession | null {
  const rows = parseJsonl(file);
  if (!rows.length) return null;
  let cwd = "", id = "", title = "";
  let createdAt = 0, updatedAt = 0;
  const messages: Message[] = [];

  for (const o of rows) {
    const ts = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : NaN;
    if (!Number.isNaN(ts)) { if (!createdAt) createdAt = ts; updatedAt = ts; }

    if (o.type === "session_meta") {
      const p = o.payload ?? {};
      if (typeof p.cwd === "string" && p.cwd && !cwd) cwd = p.cwd;
      if (typeof p.id === "string" && !id) id = p.id;
      continue;
    }
    if (o.type !== "response_item") continue;
    const p = o.payload ?? {};

    switch (p.type) {
      case "message": {
        const role = p.role;
        if (role !== "user" && role !== "assistant") break; // skip developer/system
        const text = flattenText(p.content).trim();
        if (!text) break;
        if (role === "user" && isPreamble(text)) break; // skip env/instructions preamble
        if (role === "user" && !title && !text.trimStart().startsWith("<")) title = text;
        messages.push({ role, content: [{ type: "text", text }] });
        break;
      }
      case "function_call":
      case "custom_tool_call": {
        const callId = p.call_id ?? p.id;
        if (!callId) break;
        const rawArgs = p.type === "function_call" ? p.arguments : (p.input ?? p.arguments);
        let input: Record<string, unknown> = {};
        if (typeof rawArgs === "string") {
          try { input = JSON.parse(rawArgs); } catch { input = { raw: rawArgs }; }
        } else if (rawArgs && typeof rawArgs === "object") {
          input = rawArgs;
        }
        messages.push({ role: "assistant", content: [{ type: "tool_use", id: String(callId), name: String(p.name ?? "tool"), input }] });
        break;
      }
      case "function_call_output":
      case "custom_tool_call_output": {
        const callId = p.call_id ?? p.id;
        if (!callId) break;
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: String(callId), content: codexOutput(p.output) }] });
        break;
      }
      // reasoning / web_search_call / etc. -> dropped
    }
  }

  const clean = stripOrphanTools(messages);
  if (!clean.length || !cwd) return null;
  const rid = id || path.basename(file, ".jsonl");
  return {
    source: "codex",
    sourceId: `codex:${rid}`,
    filePath: file,
    cwd,
    title: tidy(title || "Imported Codex session"),
    createdAt: createdAt || Date.now(),
    updatedAt: updatedAt || createdAt || Date.now(),
    messages: clean,
    messageCount: clean.length,
  };
}

export function scanCodex(): ParsedSession[] {
  const root = codexRoot();
  if (!existsSync(root)) return [];
  const sessions: ParsedSession[] = [];
  for (const f of walkJsonl(root)) {
    const parsed = parseCodexFile(f);
    if (parsed) sessions.push(parsed);
  }
  return sessions;
}

// --------------------------------------------------------------------- dispatch

export function scan(source: ImportSource | "all"): ParsedSession[] {
  const sessions =
    source === "claude" ? scanClaude() :
    source === "codex" ? scanCodex() :
    [...scanClaude(), ...scanCodex()];
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Where Friday looks for each source, for the UI to hint when nothing is found. */
export function importRoots(): { claude: string; codex: string; claudeExists: boolean; codexExists: boolean } {
  const claude = claudeRoot();
  const codex = codexRoot();
  return { claude, codex, claudeExists: existsSync(claude), codexExists: existsSync(codex) };
}
