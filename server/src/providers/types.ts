// =============================================================================
// Friday - canonical, provider-neutral conversation model.
//
// This is THE contract that makes "switch model mid-task without losing context"
// work. Every message lives here in one neutral shape. Each provider adapter
// translates this shape <-> its own wire format on the way out, and parses its
// response back into this shape on the way in. Because the transcript never
// lives in a provider-specific format, swapping the active provider is just
// "serialize the same history for the next model".
// =============================================================================

export type Role = "user" | "assistant";

export interface TextBlock {
  type: "text";
  text: string;
}
export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: Role;
  content: ContentBlock[];
  /** Which provider produced an assistant message (for transcript provenance badges). */
  providerId?: string;
  providerLabel?: string;
}

/** JSON-schema-ish tool definition (Anthropic-style; trivially mapped to OpenAI). */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Events streamed out of a single provider turn. */
export type ProviderEvent =
  | { type: "text"; delta: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "done"; stopReason: StopReason }
  | { type: "error"; message: string };

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "stop" | "error";

export interface ProviderTurnInput {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  /** Reasoning effort ("low"|"medium"|"high"|"max"); undefined = provider default. */
  effort?: string;
}

/** A live, ready-to-run provider built from a ProviderConfig. */
export interface Provider {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly label: string;
  readonly model?: string;
  /**
   * `false` (anthropic / openai): the model emits tool_use blocks and Friday's
   * own agent loop executes them - full fidelity, native context replay.
   * `true` (cli): an external agent CLI runs its own tool loop; Friday feeds it
   * the canonical transcript as a rendered preamble.
   */
  readonly delegatesTools: boolean;
  run(input: ProviderTurnInput): AsyncGenerator<ProviderEvent, void, unknown>;
}

export type ProviderKind = "anthropic" | "openai" | "cli";

/** Persisted, user-editable provider configuration. */
export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  label: string;
  model?: string;
  /** API key (anthropic / openai). Stored locally only. */
  apiKey?: string;
  /** Base URL for OpenAI-compatible endpoints (Mistral, Gemini-compat, Qwen, Ollama, local). */
  baseUrl?: string;
  /** CLI command template, e.g. "claude -p {prompt}" or "ollama run qwen2.5-coder". */
  command?: string;
  /** Which built-in catalog preset this was created from (for UI grouping/icons). */
  preset?: string;
  enabled: boolean;
  /** True once it has the minimum it needs to run (key/command/baseUrl present). */
  configured?: boolean;
}

/** A catalog entry: a ready-made template the user can one-click add + fill in. */
export interface ProviderPreset {
  preset: string;
  kind: ProviderKind;
  label: string;
  /** Short tagline shown in the picker. */
  blurb: string;
  defaultModel?: string;
  defaultBaseUrl?: string;
  defaultCommand?: string;
  /** What the user must supply to make it run. */
  needs: ("apiKey" | "baseUrl" | "command" | "model")[];
  /** "api" | "cli" | "local" - drives the badge in settings. */
  channel: "api" | "cli" | "local";
  accentHint?: string;
  docsUrl?: string;
}
