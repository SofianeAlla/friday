import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Message } from "../providers/types.ts";
import type { Todo } from "../tools/types.ts";
import { FRIDAY_DIR } from "../util/proc.ts";

// Workspace = projects (each a repo/folder) × conversations (per project), à la
// Claude Code. The provider-neutral transcript lives per conversation, so you can
// keep many threads per repo and switch models within any of them without losing
// context. Persisted to .friday/workspace.json.

export interface Project {
  id: string;
  name: string;
  path: string;
  isGit: boolean;
  createdAt: number;
  lastOpenedAt: number;
}

export interface ConversationUsage {
  inputTokens: number;   // cumulative across turns (for cost)
  outputTokens: number;  // cumulative
  lastInputTokens: number; // prompt size of the most recent turn (≈ context in use)
  turns: number;
}

export interface Conversation {
  id: string;
  projectId: string;
  title: string;
  messages: Message[];
  todos: Todo[];
  createdAt: number;
  updatedAt: number;
  providerLabel?: string;
  usage?: ConversationUsage;
  /** Stable source id when imported from another agent, e.g. "claude:<uuid>" — keeps re-imports idempotent. */
  importedFrom?: string;
  /** Cached running summary of the leading N messages, for fitting small-context models. Non-destructive: `messages` stays full. */
  compaction?: { throughIndex: number; text: string };
  /** Remote transport chat id this conversation is bound to (1 WhatsApp/Telegram chat = 1 conversation). */
  remoteChatId?: string;
}

export interface ConversationMeta {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  providerLabel?: string;
  messageCount: number;
}

interface Workspace {
  projects: Project[];
  conversations: Conversation[];
  activeProjectId: string | null;
  activeConversationByProject: Record<string, string>;
}

const DIR = FRIDAY_DIR;
const FILE = path.join(DIR, "workspace.json");

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

function emptyWorkspace(): Workspace {
  return { projects: [], conversations: [], activeProjectId: null, activeConversationByProject: {} };
}

let ws: Workspace = load();

function load(): Workspace {
  if (existsSync(FILE)) {
    try {
      const w = JSON.parse(readFileSync(FILE, "utf8")) as Workspace;
      w.projects ??= []; w.conversations ??= []; w.activeConversationByProject ??= {};
      return w;
    } catch { /* fall through */ }
  }
  return emptyWorkspace();
}

function persist() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(ws), "utf8");
}

// ---------------------------------------------------------------- projects

export function listProjects(): Project[] {
  return [...ws.projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}
export function getActiveProject(): Project | null {
  return ws.projects.find((p) => p.id === ws.activeProjectId) ?? null;
}
export function addProject(rawPath: string, name?: string): Project {
  const abs = path.resolve(rawPath);
  const existing = ws.projects.find((p) => p.path === abs);
  if (existing) { existing.lastOpenedAt = Date.now(); ws.activeProjectId = existing.id; ensureConversation(existing.id); persist(); return existing; }
  const isGit = existsSync(path.join(abs, ".git"));
  const proj: Project = {
    id: rid("p"), name: name?.trim() || path.basename(abs) || abs,
    path: abs, isGit, createdAt: Date.now(), lastOpenedAt: Date.now(),
  };
  ws.projects.push(proj);
  ws.activeProjectId = proj.id;
  ensureConversation(proj.id);
  persist();
  return proj;
}
export function setActiveProject(id: string): void {
  const p = ws.projects.find((x) => x.id === id);
  if (!p) return;
  p.lastOpenedAt = Date.now();
  ws.activeProjectId = id;
  ensureConversation(id);
  persist();
}
export function removeProject(id: string): void {
  ws.projects = ws.projects.filter((p) => p.id !== id);
  ws.conversations = ws.conversations.filter((c) => c.projectId !== id);
  delete ws.activeConversationByProject[id];
  if (ws.activeProjectId === id) ws.activeProjectId = ws.projects[0]?.id ?? null;
  persist();
}
export function findProjectByPath(rawPath: string): Project | null {
  const abs = path.resolve(rawPath);
  return ws.projects.find((p) => p.path === abs) ?? null;
}
/** Register a project without forcing an active conversation or stealing focus (used by import). */
export function ensureProject(rawPath: string, name?: string): Project {
  const abs = path.resolve(rawPath);
  const existing = ws.projects.find((p) => p.path === abs);
  if (existing) return existing;
  const isGit = existsSync(path.join(abs, ".git"));
  const proj: Project = {
    id: rid("p"), name: name?.trim() || path.basename(abs) || abs,
    path: abs, isGit, createdAt: Date.now(), lastOpenedAt: Date.now(),
  };
  ws.projects.push(proj);
  persist();
  return proj;
}

// ---------------------------------------------------------------- conversations

function meta(c: Conversation): ConversationMeta {
  return { id: c.id, projectId: c.projectId, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, providerLabel: c.providerLabel, messageCount: c.messages.length };
}
export function listConversations(projectId: string): ConversationMeta[] {
  return ws.conversations.filter((c) => c.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt).map(meta);
}
export function getConversation(id: string): Conversation | null {
  return ws.conversations.find((c) => c.id === id) ?? null;
}
export function newConversation(projectId: string): Conversation {
  const c: Conversation = { id: rid("c"), projectId, title: "New conversation", messages: [], todos: [], createdAt: Date.now(), updatedAt: Date.now() };
  ws.conversations.push(c);
  ws.activeConversationByProject[projectId] = c.id;
  persist();
  return c;
}
export interface ImportData {
  title: string;
  messages: Message[];
  createdAt?: number;
  updatedAt?: number;
  providerLabel?: string;
  /** Stable source id (e.g. "claude:<uuid>") so importing the same session twice is a no-op. */
  sourceId?: string;
}
/** Bulk-create a conversation from an imported transcript. Idempotent on sourceId. */
export function importConversation(projectId: string, data: ImportData): { conversation: Conversation; skipped: boolean } {
  if (data.sourceId) {
    const dup = ws.conversations.find((c) => c.importedFrom === data.sourceId);
    if (dup) return { conversation: dup, skipped: true };
  }
  const now = Date.now();
  const c: Conversation = {
    id: rid("c"), projectId,
    title: (data.title?.trim() || "Imported conversation").slice(0, 64),
    messages: data.messages, todos: [],
    createdAt: data.createdAt ?? now, updatedAt: data.updatedAt ?? now,
    providerLabel: data.providerLabel, importedFrom: data.sourceId,
  };
  ws.conversations.push(c);
  ws.activeConversationByProject[projectId] ??= c.id;
  persist();
  return { conversation: c, skipped: false };
}
/**
 * The conversation bound to a remote chat (1 chat = 1 conversation). Creates one
 * under the active project the first time that chat is seen. Returns null if no
 * project is open (the agent needs a working directory).
 */
export function remoteConversation(chatId: string, title?: string): Conversation | null {
  const existing = ws.conversations.find((c) => c.remoteChatId === chatId);
  if (existing) return existing;
  const proj = getActiveProject();
  if (!proj) return null;
  const now = Date.now();
  const c: Conversation = {
    id: rid("c"), projectId: proj.id,
    title: (title?.trim() || "WhatsApp").slice(0, 64),
    messages: [], todos: [], createdAt: now, updatedAt: now, remoteChatId: chatId,
  };
  ws.conversations.push(c);
  ws.activeConversationByProject[proj.id] ??= c.id;
  persist();
  return c;
}

/** The working directory (project path) a given conversation belongs to. */
export function cwdForConversation(convId: string): string | null {
  const c = getConversation(convId);
  if (!c) return null;
  return ws.projects.find((p) => p.id === c.projectId)?.path ?? null;
}

export function setActiveConversation(projectId: string, convId: string): void {
  if (ws.conversations.some((c) => c.id === convId && c.projectId === projectId)) {
    ws.activeConversationByProject[projectId] = convId;
    persist();
  }
}
export function removeConversation(id: string): void {
  const c = getConversation(id);
  if (!c) return;
  ws.conversations = ws.conversations.filter((x) => x.id !== id);
  if (ws.activeConversationByProject[c.projectId] === id) {
    const next = ws.conversations.find((x) => x.projectId === c.projectId);
    if (next) ws.activeConversationByProject[c.projectId] = next.id;
    else delete ws.activeConversationByProject[c.projectId];
  }
  persist();
}

/** Ensure the project has an active conversation; create one if needed. Returns it. */
export function ensureConversation(projectId: string): Conversation {
  const activeId = ws.activeConversationByProject[projectId];
  const active = activeId ? getConversation(activeId) : null;
  if (active) return active;
  const existing = ws.conversations.find((c) => c.projectId === projectId);
  if (existing) { ws.activeConversationByProject[projectId] = existing.id; persist(); return existing; }
  return newConversation(projectId);
}

/** The conversation the chat loop should read/write right now (active project + conv). */
export function getActiveConversation(): Conversation | null {
  const proj = getActiveProject();
  if (!proj) return null;
  return ensureConversation(proj.id);
}

export function appendMessage(convId: string, m: Message): void {
  const c = getConversation(convId);
  if (!c) return;
  c.messages.push(m);
  c.updatedAt = Date.now();
  if (m.providerLabel) c.providerLabel = m.providerLabel;
  // derive a title from the first user message
  if ((c.title === "New conversation" || !c.title) && m.role === "user") {
    const text = m.content.find((b) => b.type === "text") as { text: string } | undefined;
    if (text?.text) c.title = text.text.trim().replace(/\s+/g, " ").slice(0, 48);
  }
  persist();
}
export function setConversationTitle(convId: string, title: string): void {
  const c = getConversation(convId);
  if (!c || !title.trim()) return;
  c.title = title.trim().slice(0, 64);
  persist();
}

export function setCompaction(convId: string, throughIndex: number, text: string): void {
  const c = getConversation(convId);
  if (!c) return;
  c.compaction = { throughIndex, text };
  persist();
}

export function setTodos(convId: string, todos: Todo[]): void {
  const c = getConversation(convId);
  if (!c) return;
  c.todos = todos;
  c.updatedAt = Date.now();
  persist();
}

/** Record token usage for one completed turn. `lastInput` ≈ context the model just read. */
export function addUsage(convId: string, input: number, output: number, lastInput: number): void {
  const c = getConversation(convId);
  if (!c) return;
  const u = c.usage ?? { inputTokens: 0, outputTokens: 0, lastInputTokens: 0, turns: 0 };
  u.inputTokens += input;
  u.outputTokens += output;
  if (lastInput > 0) u.lastInputTokens = lastInput;
  u.turns += 1;
  c.usage = u;
  persist();
}

/** Rough token estimate from a transcript (chars/4) - fallback when the API doesn't report usage. */
export function estimateTokens(messages: Message[]): number {
  let chars = 0;
  for (const m of messages) for (const b of m.content) {
    if (b.type === "text") chars += b.text.length;
    else if (b.type === "tool_use") chars += JSON.stringify(b.input).length + b.name.length;
    else if (b.type === "tool_result") chars += b.content.length;
  }
  return Math.round(chars / 4);
}

/** The working directory tools operate in: active project path, else home. */
export function activeCwd(fallback?: string): string {
  return getActiveProject()?.path ?? fallback ?? homedir();
}

export function isDir(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
