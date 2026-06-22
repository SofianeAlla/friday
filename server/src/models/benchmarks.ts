// Coding-model benchmark snapshot (mid-2026). Numbers come from the landscape
// research the user provided; closed-source rows are positioned relative to the
// open-weight leaders described there. Treat as a filtering aid, not gospel -
// always re-test on your own codebase. Exposed via GET /api/benchmarks.

export type ModelType = "closed" | "open";

export interface BenchRow {
  id: string;
  name: string;
  family: string;        // logo key
  vendor: string;
  type: ModelType;
  license: string;
  /** SWE-bench Verified (% resolved). Higher = better raw code-fix ability. */
  sweVerified?: number;
  /** SWE-Bench Pro (% resolved). Harder, agentic, long-horizon. */
  swePro?: number;
  /** LiveBench coding (composite, 0-100). */
  liveBench?: number;
  contextK?: number;
  params?: string;
  note?: string;
  /** barn model id, if installable from The Barn. */
  barnId?: string;
}

export const BENCH_NOTE =
  "Snapshot as of 2026-06-16. Model names/ids reflect the latest checked against official docs (GPT-5.5, Claude Opus 4.8, Gemini 3.5 Flash, Grok 4.3, Mistral Medium 3.5, GLM-5.2). Some scores are vendor-published; others are positioned estimates. Benchmarks filter candidates - validate on your own codebase before committing.";

export const BENCHMARKS = {
  metrics: [
    { key: "sweVerified", label: "SWE-bench Verified", hint: "Real GitHub issue fixes (% resolved)" },
    { key: "swePro", label: "SWE-Bench Pro", hint: "Harder, long-horizon agentic tasks (% resolved)" },
    { key: "liveBench", label: "LiveBench Coding", hint: "Contamination-resistant composite (0-100)" },
  ],
  note: BENCH_NOTE,
  rows: [
    // ---------------- closed-source frontier (latest, verified 2026-06-16) ----------------
    { id: "gpt-5.5", name: "GPT-5.5", family: "openai", vendor: "OpenAI", type: "closed", license: "Proprietary", sweVerified: 81.2, swePro: 58.6, liveBench: 84.0, contextK: 400, params: "-", note: "Powers Codex; 82.7% Terminal-Bench 2.0 (released Apr 2026)." },
    { id: "claude-opus-4-8", name: "Claude Opus 4.8", family: "anthropic", vendor: "Anthropic", type: "closed", license: "Proprietary", sweVerified: 80.9, swePro: 57.8, liveBench: 84.6, contextK: 1000, params: "-", note: "Recommended coding default. (Fable 5 is more capable but access is currently suspended.)" },
    { id: "grok-4.3", name: "Grok 4.3", family: "xai", vendor: "xAI", type: "closed", license: "Proprietary", sweVerified: 79.0, swePro: 56.0, liveBench: 83.1, contextK: 1000, params: "-", note: "xAI flagship; leads agentic tool-calling, lowest hallucination rate." },
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", family: "gemini", vendor: "Google", type: "closed", license: "Proprietary", sweVerified: 78.4, swePro: 55.6, liveBench: 82.3, contextK: 1000, params: "-", note: "Newest GA; 76.2% Terminal-Bench 2.1. (Gemini 3.5 Pro not yet GA.)" },
    { id: "mistral-medium-3-5", name: "Mistral Medium 3.5", family: "mistral", vendor: "Mistral", type: "closed", license: "Proprietary", sweVerified: 77.6, swePro: 50.5, liveBench: 78.8, contextK: 256, params: "128B", note: "Replaced Devstral 2 in Mistral's Vibe agent (id mistral-medium-2604)." },

    // ---------------- open-weight ----------------
    { id: "glm-5.2", name: "GLM-5.2", family: "zai", vendor: "Z.ai", type: "open", license: "MIT-style", sweVerified: 79.3, swePro: 62.0, liveBench: 84.0, contextK: 1000, params: "MoE", note: "First open family to top SWE-Bench Pro - beats GPT-5.4 & Claude Opus 4.6.", barnId: "glm-5.2" },
    { id: "deepseek-v4-pro", name: "DeepSeek V4-Pro", family: "deepseek", vendor: "DeepSeek", type: "open", license: "MIT", sweVerified: 80.6, swePro: 57.1, liveBench: 83.2, contextK: 1000, params: "MoE", note: "Leader on raw code generation (SWE-bench Verified).", barnId: "deepseek-v4-pro" },
    { id: "kimi-k2.6", name: "Kimi K2.6", family: "moonshot", vendor: "Moonshot AI", type: "open", license: "Modified MIT", sweVerified: 78.0, swePro: 56.2, liveBench: 84.3, contextK: 256, params: "~1T MoE", note: "Top open model on the May-2026 LiveBench snapshot.", barnId: "kimi-k2.6" },
    { id: "minimax-m3", name: "MiniMax M3", family: "minimax", vendor: "MiniMax", type: "open", license: "open weight", sweVerified: 74.5, swePro: 59.0, liveBench: 80.7, contextK: 1000, params: "MoE", note: "Frontier coding + 1M ctx + multimodal; tops open-weight SWE-Bench Pro.", barnId: "minimax-m3" },
    { id: "qwen3-coder-plus", name: "Qwen3-Coder Plus", family: "qwen", vendor: "Alibaba", type: "open", license: "Apache 2.0", sweVerified: 76.0, swePro: 53.5, liveBench: 80.1, contextK: 256, params: "MoE", note: "Best efficiency per active parameter.", barnId: "qwen3-coder-plus" },
    { id: "qwen3.6-27b", name: "Qwen 3.6-27B", family: "qwen", vendor: "Alibaba", type: "open", license: "Apache 2.0", sweVerified: 77.2, swePro: 50.4, liveBench: 78.9, contextK: 256, params: "27B", note: "Runs in 22 GB VRAM; punches above its size.", barnId: "qwen3.6-27b" },
    { id: "devstral-2", name: "Devstral (24B)", family: "mistral", vendor: "Mistral", type: "open", license: "Apache 2.0", sweVerified: 72.2, swePro: 47.1, liveBench: 76.5, contextK: 128, params: "24B", note: "Strong open-weight local agent; pairs with Aider/Continue.", barnId: "devstral-2" },
    { id: "qwen2.5-coder-14b", name: "Qwen 2.5 Coder 14B", family: "qwen", vendor: "Alibaba", type: "open", license: "Apache 2.0", sweVerified: 62.3, swePro: 33.0, liveBench: 67.2, contextK: 32, params: "14B", note: "Runs on 8 GB VRAM.", barnId: "qwen2.5-coder-14b" },
    { id: "codestral-22b", name: "Codestral 22B", family: "mistral", vendor: "Mistral", type: "open", license: "Mistral", sweVerified: 51.0, swePro: 24.5, liveBench: 64.0, contextK: 32, params: "22B", note: "Best lightweight autocomplete; fits 12 GB VRAM.", barnId: "codestral-22b" },
  ] as BenchRow[],
};
