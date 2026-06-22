// Friday API client. Mirrors the backend contracts (server/src/providers/types.ts,
// server/src/tools/types.ts, server/src/agent/events.ts). Talks to the Node
// backend via /api (proxied by Vite in dev).

// ---- canonical conversation (mirror of server) ----
export type Role = "user" | "assistant";
export interface TextBlock { type: "text"; text: string }
export interface ToolUseBlock { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
export interface ToolResultBlock { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;
export interface Message {
  role: Role;
  content: ContentBlock[];
  providerId?: string;
  providerLabel?: string;
}

// ---- tools (mirror of server) ----
export interface Todo { id: string; content: string; status: "pending" | "in_progress" | "completed" }
export interface PermissionRequest { id: string; toolName: string; title: string; detail: string }
export type ToolMeta =
  | { kind: "file"; path: string; language?: string; content: string; truncated?: boolean }
  | { kind: "diff"; path: string; diff: string; added: number; removed: number; created?: boolean }
  | { kind: "command"; command: string; stdout: string; stderr: string; exitCode: number }
  | { kind: "list"; path: string; entries: { name: string; type: "file" | "dir"; size?: number }[] }
  | { kind: "search"; query: string; matches: { path: string; line: number; text: string }[] }
  | { kind: "glob"; pattern: string; files: string[] }
  | { kind: "todos"; todos: Todo[] }
  | { kind: "text" };

// ---- providers (mirror of server) ----
export type ProviderKind = "anthropic" | "openai" | "cli";
export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  label: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  command?: string;
  preset?: string;
  enabled: boolean;
  configured?: boolean;
}
export interface ProviderPreset {
  preset: string;
  kind: ProviderKind;
  label: string;
  blurb: string;
  defaultModel?: string;
  defaultBaseUrl?: string;
  defaultCommand?: string;
  needs: ("apiKey" | "baseUrl" | "command" | "model")[];
  channel: "api" | "cli" | "local";
  accentHint?: string;
  docsUrl?: string;
}
export interface ActiveProviderInfo {
  id: string;
  label: string;
  kind: ProviderKind;
  model?: string;
  channel: "api" | "cli" | "local";
  supportsEffort: boolean;
}

export type PermissionMode = "plan" | "ask" | "auto-edit" | "auto";
export type Effort = "default" | "low" | "medium" | "high" | "max";

export interface Settings {
  cwd: string;
  permissionMode: PermissionMode;
  effort?: Effort;
  accent?: { h: number; s: number; l: number };
  mode?: "dark" | "light";
}

export interface Project {
  id: string;
  name: string;
  path: string;
  isGit: boolean;
  createdAt: number;
  lastOpenedAt: number;
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

export interface Meter {
  model: string | null;
  providerLabel: string | null;
  kind: ProviderKind | null;
  contextWindow: number;
  contextUsed: number;
  contextPct: number;
  estimated: boolean;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  pricing: { in: number; out: number } | null;
  cost: { input: number; output: number; total: number; currency: string } | null;
  free: boolean;
  billing: "api" | "local" | "plan" | "cli-key";
  balanceSupported: boolean;
}

export interface BalanceInfo {
  available: boolean;
  balance?: number | null;
  currency?: string;
  message?: string;
  topUp?: number;
  granted?: number;
  accountAvailable?: boolean;
}

export interface RuntimeStatus {
  serverUp: boolean;
  hasManaged: boolean;
  hasSystem: boolean;
  host: string;
  modelsDir: string;
  totalMemGB: number;
  cpus: number;
}

export interface InstalledModel { name: string; sizeGB: number }
export interface LocalModels { running: boolean; models: InstalledModel[] }

export interface RemoteSettings {
  enabled: boolean;
  phone: string;
  autonomy: "plan" | "ask" | "auto-edit";
  channel?: "telegram" | "whatsapp";
  telegramToken?: string;
  telegramOwner?: string;
}
export interface RemoteStatus {
  state: "off" | "installing" | "starting" | "qr" | "code" | "connected" | "error";
  qr?: string;
  code?: string;
  error?: string;
  me?: string;
  bot?: string;
  owner?: string;
}
export interface RemoteState {
  settings: RemoteSettings;
  telegram: RemoteStatus;
  whatsapp: RemoteStatus;
}

export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  remote?: string | null;
  dirty?: number;
  ahead?: number;
  behind?: number;
  gitMissing?: boolean;
  message?: string;
}
export interface GitResult { ok: boolean; output?: string; message?: string }

// Bridge injected by the Electron preload (undefined in a plain browser / dev).
export interface DesktopBridge {
  isDesktop: boolean;
  platform: string;
  createDesktopShortcut: () => Promise<{ ok: boolean; path?: string; error?: string }>;
}
export const desktop: DesktopBridge | undefined =
  typeof window !== "undefined" ? (window as unknown as { friday?: DesktopBridge }).friday : undefined;

export type ImportSource = "claude" | "codex";
export interface ImportSession {
  sourceId: string;
  source: ImportSource;
  title: string;
  projectPath: string;
  projectName: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}
export interface ImportScan {
  sessions: ImportSession[];
  roots: { claude: string; codex: string; claudeExists: boolean; codexExists: boolean };
}
export interface ImportResult { imported: number; skipped: number; projects: number }

// ---- agent events (mirror of server/src/agent/events.ts) ----
export type AgentEvent =
  | { type: "session"; sessionId: string; cwd: string; provider: ActiveProviderInfo | null; permissionMode: PermissionMode; conversationId: string | null }
  | { type: "assistant_start"; provider: ActiveProviderInfo }
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string; title: string; input: Record<string, unknown> }
  | { type: "tool_end"; id: string; ok: boolean; resultPreview: string; meta?: ToolMeta }
  | { type: "todos"; todos: Todo[] }
  | { type: "awaiting_permission"; request: PermissionRequest }
  | { type: "permission_resolved"; id: string; allowed: boolean }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "assistant_committed"; message: Message }
  | { type: "title"; conversationId: string; title: string }
  | { type: "compacted"; throughIndex: number; note: string }
  | { type: "turn_done"; stopReason: string }
  | { type: "error"; message: string }
  | { type: "ping" };

export interface AppState {
  providers: ProviderConfig[];
  presets: ProviderPreset[];
  activeProviderId: string | null;
  settings: Settings;
  projects: Project[];
  activeProjectId: string | null;
  conversations: ConversationMeta[];
  activeConversationId: string | null;
  session: { messages: Message[]; todos: Todo[] };
  meter: Meter;
  platform: string;
}

// ---- The Barn (open-weight model catalog) ----
export interface BarnModel {
  id: string;
  name: string;
  family: string;
  vendor: string;
  tagline: string;
  params?: string;
  contextK?: number;
  license: string;
  tier: "agentic" | "local" | "closed";
  install: "ollama" | "api";
  kind?: "anthropic" | "openai";
  ollamaTag?: string;
  vramGB?: number;
  api?: { baseUrl: string; model: string };
  highlight?: string;
  recommended?: boolean;
  docsUrl?: string;
}

export type InstallEvent =
  | { type: "status"; message: string }
  | { type: "log"; line: string }
  | { type: "done"; ok: boolean; providerId?: string; needsKey?: boolean; channel?: string; authHint?: string }
  | { type: "error"; message: string };

export interface CliStatus {
  applicable: boolean;
  binName?: string;
  onPath?: boolean;
  managed?: boolean;
  installed?: boolean;
  installable?: boolean;
  authHint?: string;
}

// ---- Benchmarks ----
export type ModelType = "closed" | "open";
export interface BenchRow {
  id: string;
  name: string;
  family: string;
  vendor: string;
  type: ModelType;
  license: string;
  sweVerified?: number;
  swePro?: number;
  liveBench?: number;
  contextK?: number;
  params?: string;
  note?: string;
  barnId?: string;
}
export interface BenchmarksData {
  metrics: { key: "sweVerified" | "swePro" | "liveBench"; label: string; hint: string }[];
  note: string;
  rows: BenchRow[];
}

async function jx<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** POST a JSON body and stream back `data: <json>` SSE events. Shared by chat + install. */
function streamPost<E>(url: string, body: unknown, onEvent: (e: E) => void): { cancel: () => void } {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        onEvent({ type: "error", message: `Request failed: HTTP ${res.status}` } as unknown as E);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          try { onEvent(JSON.parse(json) as E); } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        onEvent({ type: "error", message: (e as Error).message } as unknown as E);
      }
    }
  })();
  return { cancel: () => controller.abort() };
}

export const api = {
  async getState(): Promise<AppState> {
    return jx(await fetch("/api/state"));
  },
  async addProvider(cfg: Partial<ProviderConfig>): Promise<AppState> {
    return jx(await fetch("/api/providers", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cfg),
    }));
  },
  async deleteProvider(id: string): Promise<AppState> {
    return jx(await fetch(`/api/providers/${encodeURIComponent(id)}`, { method: "DELETE" }));
  },
  async setActive(id: string): Promise<AppState> {
    return jx(await fetch("/api/providers/active", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
    }));
  },
  async testProvider(id: string): Promise<{ ok: boolean; status?: number; message?: string }> {
    return jx(await fetch(`/api/providers/${encodeURIComponent(id)}/test`, { method: "POST" }));
  },
  async getMeter(): Promise<{ meter: Meter }> {
    return jx(await fetch("/api/meter"));
  },
  async getRuntimeStatus(): Promise<RuntimeStatus> {
    return jx(await fetch("/api/runtime/status"));
  },
  async getLocalModels(): Promise<LocalModels> {
    return jx(await fetch("/api/runtime/models"));
  },
  async removeLocalModel(tag: string): Promise<LocalModels> {
    return jx(await fetch("/api/runtime/models/remove", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tag }) }));
  },
  async barnUse(id: string): Promise<AppState> {
    return jx(await fetch("/api/barn/use", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }));
  },
  async cliStatus(id: string): Promise<CliStatus> {
    return jx(await fetch(`/api/providers/${encodeURIComponent(id)}/cli-status`));
  },
  installCli(id: string, onEvent: (e: InstallEvent) => void): { cancel: () => void } {
    return streamPost<InstallEvent>(`/api/providers/${encodeURIComponent(id)}/install-cli`, {}, onEvent);
  },

  // ---- remote (Telegram recommended · WhatsApp experimental) ----
  async getRemote(): Promise<RemoteState> {
    return jx(await fetch("/api/remote"));
  },
  async setRemote(patch: Partial<RemoteSettings>): Promise<RemoteState> {
    return jx(await fetch("/api/remote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }));
  },
  async remoteSimulate(text: string): Promise<{ reply: string; tools: number; ok: boolean }> {
    return jx(await fetch("/api/remote/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }));
  },
  // Telegram
  async telegramStatus(): Promise<RemoteStatus> { return jx(await fetch("/api/remote/telegram/status")); },
  async telegramConnect(): Promise<RemoteStatus> { return jx(await fetch("/api/remote/telegram/connect", { method: "POST" })); },
  async telegramDisconnect(): Promise<RemoteStatus> { return jx(await fetch("/api/remote/telegram/disconnect", { method: "POST" })); },
  // WhatsApp
  async remoteStatus(): Promise<RemoteStatus> { return jx(await fetch("/api/remote/status")); },
  async remoteConnect(phone?: string): Promise<RemoteStatus> {
    return jx(await fetch("/api/remote/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(phone ? { phone } : {}) }));
  },
  async remoteDisconnect(): Promise<RemoteStatus> { return jx(await fetch("/api/remote/disconnect", { method: "POST" })); },
  async balance(id: string): Promise<BalanceInfo> {
    return jx(await fetch(`/api/providers/${encodeURIComponent(id)}/balance`));
  },
  async updateSettings(patch: Partial<Settings>): Promise<AppState> {
    return jx(await fetch("/api/settings", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
    }));
  },
  async resetSession(): Promise<AppState> {
    return jx(await fetch("/api/session/reset", { method: "POST" }));
  },

  // ---- projects (repos) ----
  async addProject(path: string, name?: string): Promise<AppState> {
    return jx(await fetch("/api/projects/add", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, name }),
    }));
  },
  async setActiveProject(id: string): Promise<AppState> {
    return jx(await fetch("/api/projects/active", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
    }));
  },
  async deleteProject(id: string): Promise<AppState> {
    return jx(await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }));
  },

  // ---- conversations (per project) ----
  async newConversation(): Promise<AppState> {
    return jx(await fetch("/api/conversations/new", { method: "POST" }));
  },
  async setActiveConversation(id: string): Promise<AppState> {
    return jx(await fetch("/api/conversations/active", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
    }));
  },
  async deleteConversation(id: string): Promise<AppState> {
    return jx(await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }));
  },
  async resolvePermission(id: string, allowed: boolean): Promise<void> {
    await fetch("/api/permission", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, allowed }),
    });
  },
  async abort(): Promise<void> {
    await fetch("/api/chat/abort", { method: "POST" }).catch(() => {});
  },
  async fsTree(path?: string): Promise<{ root: string; entries: { name: string; type: "file" | "dir"; path: string }[] }> {
    const q = path ? `?path=${encodeURIComponent(path)}` : "";
    return jx(await fetch(`/api/fs/tree${q}`));
  },
  async fsFile(path: string): Promise<{ path: string; content: string; language: string; truncated: boolean }> {
    return jx(await fetch(`/api/fs/file?path=${encodeURIComponent(path)}`));
  },
  async pickFolder(): Promise<{ path?: string; cancelled?: boolean; error?: string }> {
    return jx(await fetch("/api/fs/pick", { method: "POST" }));
  },

  // ---- git / GitHub ----
  async gitStatus(): Promise<GitStatus> {
    return jx(await fetch("/api/git/status"));
  },
  async gitInit(): Promise<GitResult> {
    return jx(await fetch("/api/git/init", { method: "POST" }));
  },
  async gitConnect(url: string): Promise<GitResult> {
    return jx(await fetch("/api/git/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }));
  },
  async gitCommitPush(message: string): Promise<GitResult> {
    return jx(await fetch("/api/git/commit-push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) }));
  },

  // ---- import from Claude Code / Codex ----
  async scanImport(source: ImportSource | "all" = "all"): Promise<ImportScan> {
    return jx(await fetch(`/api/import/scan?source=${source}`));
  },
  async runImport(source: ImportSource | "all", sessionIds?: string[]): Promise<ImportResult> {
    return jx(await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, sessionIds }) }));
  },

  // ---- The Barn + Benchmarks ----
  async getBarn(): Promise<{ models: BarnModel[] }> {
    return jx(await fetch("/api/barn"));
  },
  async getBenchmarks(): Promise<BenchmarksData> {
    return jx(await fetch("/api/benchmarks"));
  },
  /** Install a Barn model (ollama pull or API registration). Streams progress. */
  installBarn(id: string, onEvent: (e: InstallEvent) => void): { cancel: () => void } {
    return streamPost<InstallEvent>("/api/barn/install", { id }, onEvent);
  },

  /**
   * Stream a chat turn. Sends the user's prompt, then yields AgentEvents as the
   * provider-neutral agent loop runs. Returns an abort handle.
   */
  chat(text: string, onEvent: (e: AgentEvent) => void): { cancel: () => void } {
    return streamPost<AgentEvent>("/api/chat", { text }, onEvent);
  },
};
