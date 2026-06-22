// The event protocol streamed over SSE from POST /api/chat. The agent loop
// yields these; the Express layer serialises them as `data: <json>\n\n`; the
// frontend (web/src/lib/api.ts mirrors these types) renders them.

import type { ToolMeta, Todo, PermissionRequest } from "../tools/types.ts";
import type { Message } from "../providers/types.ts";

export interface ActiveProviderInfo {
  id: string;
  label: string;
  kind: "anthropic" | "openai" | "cli";
  model?: string;
  channel: "api" | "cli" | "local";
  supportsEffort: boolean;
}

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

export type PermissionMode = "plan" | "ask" | "auto-edit" | "auto";
