// =============================================================================
// "The Barn" - Friday's stable of the best open-weight coding models.
// One click installs a model and wires it up as a usable provider:
//   - tier "local": `ollama pull <tag>` then a local CLI provider (offline, no key)
//   - tier "agentic": registers an OpenAI-compatible API provider (you add a key)
//
// Data reflects the mid-2026 open-weight landscape (see Benchmarks for sources).
// Model ids / ollama tags are best-effort and editable after install.
// =============================================================================

export interface BarnModel {
  id: string;
  name: string;
  family: string;       // logo key (see web ModelLogo)
  vendor: string;
  tagline: string;
  params?: string;
  contextK?: number;    // 1000 => "1M"
  license: string;
  tier: "agentic" | "local" | "closed";
  install: "ollama" | "api";
  kind?: "anthropic" | "openai"; // for api/closed models (default openai)
  ollamaTag?: string;
  vramGB?: number;
  api?: { baseUrl: string; model: string };
  highlight?: string;   // headline benchmark / claim
  recommended?: boolean;
  docsUrl?: string;
}

export const BARN: BarnModel[] = [
  // ----------------------------- top-tier agentic (API) -----------------------------
  // Endpoints + model ids web-verified 2026-06-16. GLM's current best is 5.2 (5.1 still exists).
  {
    id: "glm-5.2", name: "GLM-5.2", family: "zai", vendor: "Z.ai",
    tagline: "Strongest all-around open-weight agent (5.2 supersedes the SWE-Bench-Pro-topping 5.1). 1M context.",
    params: "MoE", contextK: 1000, license: "MIT-style (open weight)", tier: "agentic",
    install: "api", api: { baseUrl: "https://api.z.ai/api/paas/v4", model: "glm-5.2" },
    highlight: "First open family to top SWE-Bench Pro - beats GPT-5.4 & Claude Opus 4.6", recommended: true,
    docsUrl: "https://docs.z.ai/guides/llm/glm-5.2",
  },
  {
    id: "deepseek-v4-pro", name: "DeepSeek V4-Pro", family: "deepseek", vendor: "DeepSeek",
    tagline: "Benchmark leader for raw code generation. 1M context, clean MIT license.",
    params: "MoE", contextK: 1000, license: "MIT", tier: "agentic",
    install: "api", api: { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-pro" },
    highlight: "80.6% SWE-bench Verified · MIT · 1M ctx", recommended: true,
    docsUrl: "https://api-docs.deepseek.com",
  },
  {
    id: "deepseek-v4-flash", name: "DeepSeek V4-Flash", family: "deepseek", vendor: "DeepSeek",
    tagline: "The fast, cheaper V4 variant - great default for everyday agentic work.",
    params: "MoE", contextK: 1000, license: "MIT", tier: "agentic",
    install: "api", api: { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
    highlight: "Near-Pro quality at a fraction of the cost",
    docsUrl: "https://api-docs.deepseek.com",
  },
  {
    id: "kimi-k2.6", name: "Kimi K2.6", family: "moonshot", vendor: "Moonshot AI",
    tagline: "~1T-param MoE for agent swarms and long autonomous runs. (kimi-k2.7-code is the newest coding-specialised sibling.)",
    params: "~1T MoE", contextK: 256, license: "Modified MIT", tier: "agentic",
    install: "api", api: { baseUrl: "https://api.moonshot.ai/v1", model: "kimi-k2.6" },
    highlight: "Top open model on the May-2026 LiveBench coding snapshot",
    docsUrl: "https://platform.kimi.ai/docs/api/overview",
  },
  {
    id: "minimax-m3", name: "MiniMax M3", family: "minimax", vendor: "MiniMax",
    tagline: "Frontier coding + 1M context + native multimodality in one open model.",
    params: "MoE", contextK: 1000, license: "open weight", tier: "agentic",
    install: "api", api: { baseUrl: "https://api.minimax.io/v1", model: "MiniMax-M3" },
    highlight: "Tops open-weight SWE-Bench Pro at 59.0%",
    docsUrl: "https://platform.minimax.io/docs/api-reference/text-openai-api",
  },
  {
    id: "qwen3-coder-plus", name: "Qwen3-Coder Plus", family: "qwen", vendor: "Alibaba",
    tagline: "Best efficiency per active parameter - strong when inference cost matters.",
    params: "MoE", contextK: 256, license: "Apache 2.0", tier: "agentic",
    install: "api", api: { baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen3-coder-plus" },
    highlight: "Best quality-per-FLOP of the open agentic tier",
    docsUrl: "https://www.alibabacloud.com/help/en/model-studio",
  },

  // ----------------------------- local / self-hosted (Ollama) -----------------------------
  // All ollama tags below were verified to resolve on ollama.com/library 2026-06-16.
  {
    id: "qwen3-coder-30b", name: "Qwen3-Coder 30B", family: "qwen", vendor: "Alibaba",
    tagline: "The practical local agent: 30B MoE (3.3B active), 256K context, runs on consumer GPUs.",
    params: "30B MoE", contextK: 256, license: "Apache 2.0", tier: "local",
    install: "ollama", ollamaTag: "qwen3-coder:30b", vramGB: 24,
    highlight: "Best all-round local agentic coder", recommended: true,
    docsUrl: "https://ollama.com/library/qwen3-coder",
  },
  {
    id: "qwen3.6-27b", name: "Qwen 3.6-27B", family: "qwen", vendor: "Alibaba",
    tagline: "27B dense model that punches far above its size. A local sweet spot.",
    params: "27B", contextK: 256, license: "Apache 2.0", tier: "local",
    install: "ollama", ollamaTag: "qwen3.6:27b", vramGB: 22,
    highlight: "77.2% SWE-bench Verified · runs in 22 GB VRAM", recommended: true,
    docsUrl: "https://ollama.com/library/qwen3.6",
  },
  {
    id: "devstral-2", name: "Devstral (24B)", family: "mistral", vendor: "Mistral",
    tagline: "Multi-file agentic edits, 128K context. Pairs with Aider & Continue.dev.",
    params: "24B", contextK: 128, license: "Apache 2.0", tier: "local",
    install: "ollama", ollamaTag: "devstral", vramGB: 16,
    highlight: "Strong open-weight local agent · Apache 2.0",
    docsUrl: "https://ollama.com/library/devstral",
  },
  {
    id: "codestral-22b", name: "Codestral 22B", family: "mistral", vendor: "Mistral",
    tagline: "Fast fill-in-the-middle autocomplete. Fits a 12 GB GPU.",
    params: "22B", contextK: 32, license: "Mistral (non-prod free)", tier: "local",
    install: "ollama", ollamaTag: "codestral", vramGB: 12,
    highlight: "Best lightweight autocomplete",
    docsUrl: "https://ollama.com/library/codestral",
  },
  {
    id: "qwen2.5-coder-14b", name: "Qwen 2.5 Coder 14B", family: "qwen", vendor: "Alibaba",
    tagline: "Runs on modest machines: solid coding on just 8 GB VRAM.",
    params: "14B", contextK: 32, license: "Apache 2.0", tier: "local",
    install: "ollama", ollamaTag: "qwen2.5-coder:14b", vramGB: 8,
    highlight: "Great quality on an 8 GB GPU",
    docsUrl: "https://ollama.com/library/qwen2.5-coder",
  },

  // ----------------------------- closed-source (API key) -----------------------------
  {
    id: "claude", name: "Claude Opus 4.8", family: "anthropic", vendor: "Anthropic",
    tagline: "Best-in-class agentic coding. Paste your Anthropic key.",
    contextK: 1000, license: "Proprietary", tier: "closed",
    install: "api", kind: "anthropic", api: { baseUrl: "https://api.anthropic.com", model: "claude-opus-4-8" },
    highlight: "Top long-horizon agentic quality", recommended: true,
    docsUrl: "https://platform.claude.com/docs",
  },
  {
    id: "openai", name: "GPT-5.5", family: "openai", vendor: "OpenAI",
    tagline: "OpenAI's flagship; powers Codex.",
    contextK: 400, license: "Proprietary", tier: "closed",
    install: "api", kind: "openai", api: { baseUrl: "https://api.openai.com/v1", model: "gpt-5.5" },
    highlight: "82.7% Terminal-Bench 2.0",
    docsUrl: "https://developers.openai.com/api/docs/models",
  },
  {
    id: "grok", name: "Grok 4.3", family: "xai", vendor: "xAI",
    tagline: "xAI's flagship; leads agentic tool-calling.",
    contextK: 1000, license: "Proprietary", tier: "closed",
    install: "api", kind: "openai", api: { baseUrl: "https://api.x.ai/v1", model: "grok-4.3" },
    highlight: "Lowest hallucination rate",
    docsUrl: "https://docs.x.ai",
  },
  {
    id: "gemini", name: "Gemini 3.5 Flash", family: "gemini", vendor: "Google",
    tagline: "Newest GA Gemini for agentic coding. 1M context.",
    contextK: 1000, license: "Proprietary", tier: "closed",
    install: "api", kind: "openai", api: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.5-flash" },
    highlight: "76.2% Terminal-Bench 2.1",
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
  },
  {
    id: "mistral-medium", name: "Mistral Medium 3.5", family: "mistral", vendor: "Mistral",
    tagline: "Mistral's top agentic coder via API.",
    contextK: 256, license: "Proprietary", tier: "closed",
    install: "api", kind: "openai", api: { baseUrl: "https://api.mistral.ai/v1", model: "mistral-medium-2604" },
    highlight: "77.6% SWE-bench Verified",
    docsUrl: "https://docs.mistral.ai",
  },
];

export function getBarnModel(id: string): BarnModel | undefined {
  return BARN.find((m) => m.id === id);
}
