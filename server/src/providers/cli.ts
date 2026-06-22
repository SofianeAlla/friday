import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Message, Provider, ProviderConfig, ProviderEvent, ProviderTurnInput } from "./types.ts";
import { commandExists } from "../util/proc.ts";

const INSTALL_HINTS: Record<string, string> = {
  claude: "Install it with `npm i -g @anthropic-ai/claude-code`, or just add Claude on the API tab (needs only a key).",
  codex: "Install it with `npm i -g @openai/codex`, or add OpenAI on the API tab.",
  gemini: "Install it with `npm i -g @google/gemini-cli`, or add Gemini on the API tab.",
  vibe: "Install it with `npm i -g @mistralai/vibe-cli`, or add Mistral on the API tab.",
};

// CLI adapter - drive an external coding agent (claude / codex / gemini) in
// print mode, or a local model via `ollama run`. These agents run their own
// tool loop and edit files on disk directly, so Friday delegates tools to them
// and just streams their stdout back as the assistant's reply. Crucially, the
// SAME canonical transcript is rendered into the prompt, so switching to/from a
// CLI provider keeps the conversation context intact.

const ANSI = /\x1B\[[0-?]*[ -/]*[@-~]/g;

/** Render the provider-neutral transcript into a single prompt string. */
function renderTranscript(system: string, messages: Message[]): string {
  const lines: string[] = [];
  if (system) lines.push(system, "");
  lines.push("=== Conversation so far ===");
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type === "text" && b.text.trim()) {
        lines.push(`${m.role === "user" ? "User" : "Assistant"}: ${b.text.trim()}`);
      } else if (b.type === "tool_use") {
        lines.push(`Assistant [used ${b.name}]: ${JSON.stringify(b.input).slice(0, 400)}`);
      } else if (b.type === "tool_result") {
        lines.push(`Tool result: ${b.content.slice(0, 600)}`);
      }
    }
  }
  lines.push("=== End of history. Respond to the latest user message. ===");
  return lines.join("\n");
}

/** Safe single-argument quoting so prompt content can't break out of the shell. */
function shellQuote(s: string): string {
  if (process.platform === "win32") {
    // cmd.exe: drop CR (truncates the line), escape % (variable expansion), wrap in quotes.
    return `"${s.replace(/\r/g, "").replace(/%/g, "%%").replace(/"/g, '""')}"`;
  }
  // POSIX: single-quote, closing-quote dance for embedded single quotes.
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function createCliProvider(cfg: ProviderConfig): Provider {
  return {
    id: cfg.id,
    kind: "cli",
    label: cfg.label,
    model: cfg.model,
    delegatesTools: true,
    async *run({ system, messages, signal }: ProviderTurnInput): AsyncGenerator<ProviderEvent> {
      const template = (cfg.command || "").trim();
      if (!template) {
        yield { type: "error", message: `${cfg.label}: no CLI command configured.` };
        return;
      }
      // Pre-flight: is the CLI actually installed? (ollama is managed separately.)
      const first = (template.replace(/\{prompt\}/g, "").trim().split(/\s+/)[0] || "").replace(/^["']|["']$/g, "");
      if (first && !/ollama/i.test(first)) {
        const present = /[\\/]/.test(first) ? existsSync(first) : commandExists(first);
        if (!present) {
          const known = !!INSTALL_HINTS[first.toLowerCase()];
          const msg = known
            ? `The "${first}" CLI isn't installed yet - Friday can install it for you: open Settings → Models and click "Install CLI" on this provider, then chat again.`
            : `The "${first}" CLI isn't installed or isn't on your PATH. Make sure it's installed, or use an API model from Settings instead.`;
          yield { type: "error", message: msg };
          return;
        }
      }

      const prompt = renderTranscript(system, messages);
      const hasToken = template.includes("{prompt}");
      let cmd = hasToken ? template.replace(/\{prompt\}/g, shellQuote(prompt)) : template;

      // Pass the chosen model through for CLIs that take --model (claude/codex/gemini),
      // unless the command already specifies one. (ollama uses its tag, not --model.)
      const binBase = path.parse(first).name.toLowerCase(); // strips any shim ext (.cmd/.exe/.ps1…)
      if (cfg.model && ["claude", "codex", "gemini"].includes(binBase) && !/(^|\s)(--model|-m)(\s|=)/.test(cmd)) {
        const mm = cmd.match(/^(\s*"[^"]*"|\s*\S+)([\s\S]*)$/);
        if (mm) cmd = `${mm[1]} --model ${shellQuote(cfg.model)}${mm[2]}`;
      }

      // Optional: drive the CLI with an API key instead of its own login/subscription.
      const authEnv: Record<string, string> = {};
      if (cfg.apiKey) {
        if (binBase === "claude") authEnv.ANTHROPIC_API_KEY = cfg.apiKey;
        else if (binBase === "codex") authEnv.OPENAI_API_KEY = cfg.apiKey;
        else if (binBase === "gemini") { authEnv.GEMINI_API_KEY = cfg.apiKey; authEnv.GOOGLE_API_KEY = cfg.apiKey; }
        else if (binBase === "vibe") authEnv.MISTRAL_API_KEY = cfg.apiKey;
      }

      const child = spawn(cmd, {
        cwd: process.env.FRIDAY_CWD || process.cwd(),
        shell: true, // resolve PATH / .cmd on Windows; prompt is shell-quoted or via stdin
        env: { ...process.env, ...authEnv },
      });

      let stderr = "";
      let spawnErr: string | null = null;
      child.stderr?.on("data", (d) => { stderr += String(d); });
      child.on("error", (err) => { spawnErr = err.message; });

      const onAbort = () => { try { child.kill(); } catch { /* noop */ } };
      signal?.addEventListener("abort", onAbort, { once: true });

      // Feed the prompt on stdin too (covers CLIs that read piped input).
      try { child.stdin?.write(prompt + "\n"); child.stdin?.end(); } catch { /* noop */ }

      const exitCode = new Promise<number>((res) => child.on("close", (c) => res(c ?? 0)));

      try {
        // Streams are async-iterable - the reliable way to relay stdout live.
        let chunks = 0;
        if (child.stdout) {
          child.stdout.setEncoding("utf8");
          for await (const chunk of child.stdout as AsyncIterable<string>) {
            chunks++;
            yield { type: "text", delta: chunk.replace(ANSI, "") };
          }
        }
        const code = await exitCode;
        console.error("[cli] done code=", code, "chunks=", chunks, "stderr=", JSON.stringify(stderr.slice(0, 200)), "spawnErr=", spawnErr);
        if (spawnErr) { yield { type: "error", message: `${cfg.label}: ${spawnErr}` }; return; }
        if (code !== 0 && stderr.trim()) {
          yield { type: "error", message: `${cfg.label} exited ${code}: ${stderr.replace(ANSI, "").trim().slice(0, 800)}` };
          return;
        }
        yield { type: "done", stopReason: "end_turn" };
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
