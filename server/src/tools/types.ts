// Shared tool contracts. Tools run on the backend against the session's working
// directory. Each returns `content` (text the model sees) plus optional `meta`
// (rich render hints the frontend uses to show diffs/output/file trees - all of
// which stay collapsed by default, because Friday is AI-first and hides code
// unless the developer chooses to dig in).

export interface Todo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface PermissionRequest {
  id: string;
  toolName: string;
  title: string;
  detail: string;
}

export interface ToolContext {
  cwd: string;
  sessionId: string;
  setTodos: (todos: Todo[]) => void;
  /** Resolves true if the user (or auto/plan policy) allows the action. */
  requestPermission: (req: PermissionRequest) => Promise<boolean>;
  signal?: AbortSignal;
}

export type ToolMeta =
  | { kind: "file"; path: string; language?: string; content: string; truncated?: boolean }
  | { kind: "diff"; path: string; diff: string; added: number; removed: number; created?: boolean }
  | { kind: "command"; command: string; stdout: string; stderr: string; exitCode: number }
  | { kind: "list"; path: string; entries: { name: string; type: "file" | "dir"; size?: number }[] }
  | { kind: "search"; query: string; matches: { path: string; line: number; text: string }[] }
  | { kind: "glob"; pattern: string; files: string[] }
  | { kind: "todos"; todos: Todo[] }
  | { kind: "text" };

export interface ToolResult {
  content: string;
  isError?: boolean;
  meta?: ToolMeta;
  /** If true, the loop should treat this as a denied/aborted action. */
  denied?: boolean;
}
