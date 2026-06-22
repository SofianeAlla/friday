import type { ProviderPreset } from "./types.ts";

// Built-in catalog. Each preset is a one-click template the user fills in
// (an API key, or just picks the CLI). Covers Claude, Codex/GPT, Mistral,
// Gemini, Qwen, plus a couple of embedded open-source models via Ollama.
//
// Model ids are sensible, editable defaults - every provider lets you type a
// different model in Settings, so new releases never block you.
export const PRESETS: ProviderPreset[] = [
  // ---------------- API ----------------
  {
    preset: "claude", kind: "anthropic", label: "Claude", channel: "api",
    blurb: "Anthropic's Claude - best-in-class agentic coding.",
    defaultModel: "claude-opus-4-8", needs: ["apiKey"],
    accentHint: "30 60% 55%", docsUrl: "https://platform.claude.com/docs",
  },
  {
    preset: "openai", kind: "openai", label: "OpenAI / Codex", channel: "api",
    blurb: "GPT-5.5 / GPT-5.4 & Codex via the OpenAI API.",
    defaultBaseUrl: "https://api.openai.com/v1", defaultModel: "gpt-5.5",
    needs: ["apiKey"], docsUrl: "https://developers.openai.com/api/docs/models",
  },
  {
    preset: "mistral", kind: "openai", label: "Mistral Code", channel: "api",
    blurb: "Mistral Medium 3.5 - now Mistral's top agentic coder (77.6% SWE-bench).",
    defaultBaseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-medium-2604",
    needs: ["apiKey"], docsUrl: "https://docs.mistral.ai/getting-started/models/models_overview/",
  },
  {
    preset: "gemini", kind: "openai", label: "Gemini", channel: "api",
    blurb: "Google Gemini via its OpenAI-compatible endpoint.",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.5-flash", needs: ["apiKey"], docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
  },
  {
    preset: "qwen", kind: "openai", label: "Qwen Code", channel: "api",
    blurb: "Qwen3-Coder via Alibaba DashScope (OpenAI-compatible).",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen3-coder-plus", needs: ["apiKey"],
    docsUrl: "https://www.alibabacloud.com/help/en/model-studio",
  },
  {
    preset: "grok", kind: "openai", label: "Grok (xAI)", channel: "api",
    blurb: "xAI's Grok - OpenAI-compatible. grok-4.3 leads for coding.",
    defaultBaseUrl: "https://api.x.ai/v1", defaultModel: "grok-4.3",
    needs: ["apiKey"], docsUrl: "https://docs.x.ai",
  },
  {
    preset: "custom", kind: "openai", label: "Custom (OpenAI-compatible)", channel: "api",
    blurb: "Any OpenAI-compatible cloud API - OpenRouter, Together, Groq, Fireworks, vLLM…",
    needs: ["apiKey", "baseUrl", "model"], docsUrl: "https://platform.openai.com/docs/api-reference/chat",
  },

  // ---------------- CLI (use your existing subscription / installed agent) ----------------
  {
    preset: "claude-cli", kind: "cli", label: "Claude Code CLI", channel: "cli",
    blurb: "Drive the installed `claude` CLI in print mode - uses your subscription.",
    defaultCommand: "claude -p {prompt}", needs: ["command"],
  },
  {
    preset: "codex-cli", kind: "cli", label: "Codex CLI", channel: "cli",
    blurb: "Run OpenAI's `codex exec` headless.",
    defaultCommand: "codex exec {prompt}", needs: ["command"],
  },
  {
    preset: "gemini-cli", kind: "cli", label: "Gemini CLI", channel: "cli",
    blurb: "Run Google's `gemini` CLI non-interactively.",
    defaultCommand: "gemini -p {prompt}", needs: ["command"],
  },
  {
    preset: "mistral-cli", kind: "cli", label: "Mistral Vibe CLI", channel: "cli",
    blurb: "Mistral's open-source terminal agent (Vibe, powered by Devstral 2). Installs via uv/pip.",
    defaultCommand: "vibe --prompt {prompt}", needs: ["command"],
    docsUrl: "https://mistral.ai/products/vibe/code/",
  },

  // ---------------- Local / open-source (embedded via Ollama, no key) ----------------
  {
    preset: "qwen-ollama", kind: "cli", label: "Qwen Coder · local", channel: "local",
    blurb: "Qwen2.5-Coder running locally through Ollama. Fully offline.",
    defaultCommand: "ollama run qwen2.5-coder", needs: ["command"],
    docsUrl: "https://ollama.com/library/qwen2.5-coder",
  },
  {
    preset: "deepseek-ollama", kind: "cli", label: "DeepSeek Coder · local", channel: "local",
    blurb: "DeepSeek-Coder-V2 running locally through Ollama. Fully offline.",
    defaultCommand: "ollama run deepseek-coder-v2", needs: ["command"],
    docsUrl: "https://ollama.com/library/deepseek-coder-v2",
  },
];

export function getPreset(id: string): ProviderPreset | undefined {
  return PRESETS.find((p) => p.preset === id);
}
