// Managed install of agent CLIs (claude / codex / gemini). Like the local model
// runtime, Friday installs these for you - into its own data dir via npm, so
// there's no global install and no manual step. (Each CLI still handles its own
// login/auth; Friday only manages getting the binary onto the machine.)

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { commandExists, FRIDAY_DIR } from "../util/proc.ts";

const CLI_DIR = path.join(FRIDAY_DIR, "runtime", "cli");

// bin name → how Friday can install it. npm packages land in Friday's own dir;
// uv/pip tools install onto PATH (Vibe is a Python tool, not on npm).
interface CliPkg { bin: string; auth: string; npm?: string; uv?: string; pip?: string }
const CLI_PKGS: Record<string, CliPkg> = {
  claude: { bin: "claude", npm: "@anthropic-ai/claude-code", auth: "Run it once to sign in, or set ANTHROPIC_API_KEY." },
  codex: { bin: "codex", npm: "@openai/codex", auth: "Run `codex` once to sign in, or set OPENAI_API_KEY." },
  gemini: { bin: "gemini", npm: "@google/gemini-cli", auth: "Run `gemini` once to sign in with your Google account." },
  vibe: { bin: "vibe", uv: "mistral-vibe", pip: "mistral-vibe", auth: "Run `vibe` once to sign in, or set MISTRAL_API_KEY." },
};

/** Run an install command, stream output, and capture a stderr/last-output tail for diagnostics. */
function runInstall(cmd: string, onLog: (s: string) => void): Promise<{ code: number; tail: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, env: process.env });
    let tail = "";
    const relay = (d: unknown) => {
      const s = String(d);
      s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => onLog(l));
      tail = (tail + " " + s).replace(/\s+/g, " ").slice(-400);
    };
    child.stdout?.on("data", relay);
    child.stderr?.on("data", relay);
    child.on("error", (e) => resolve({ code: -1, tail: e.message }));
    child.on("close", (c) => resolve({ code: c ?? 0, tail: tail.trim().slice(-240) }));
  });
}

// npm --prefix puts shims in node_modules/.bin; the launcher extension varies by
// OS/npm version, so probe several candidates.
function resolveManagedBin(bin: string): string | null {
  const dir = path.join(CLI_DIR, "node_modules", ".bin");
  const cands = process.platform === "win32"
    ? [`${bin}.cmd`, `${bin}.exe`, bin, `${bin}.ps1`].map((n) => path.join(dir, n))
    : [path.join(dir, bin)];
  return cands.find(existsSync) ?? null;
}

/** The bin name a CLI command invokes (first token, de-pathed, de-suffixed). */
export function cliBinName(command: string | undefined): string {
  const first = (command || "").trim().split(/\s+/)[0]?.replace(/^["']|["']$/g, "") ?? "";
  return path.basename(first).replace(/\.(cmd|exe|bat)$/i, "").toLowerCase();
}

export interface CliStatus {
  binName: string;
  onPath: boolean;
  managed: boolean;
  installed: boolean;
  installable: boolean;
  authHint?: string;
}

export function cliStatus(command: string | undefined): CliStatus {
  const first = (command || "").trim().split(/\s+/)[0]?.replace(/^["']|["']$/g, "") ?? "";
  const binName = cliBinName(command);
  const isPath = /[\\/]/.test(first);
  const onPath = isPath ? existsSync(first) : commandExists(binName);
  const managed = !!resolveManagedBin(binName);
  const installable = !!CLI_PKGS[binName];
  return { binName, onPath, managed, installed: onPath || managed, installable, authHint: CLI_PKGS[binName]?.auth };
}

export interface CliInstallResult { ok: boolean; bin?: string; source?: "system" | "managed"; message?: string; authHint?: string }

/** Ensure a CLI is available; install via npm (into Friday's dir) or uv/pip (onto PATH). */
export async function ensureCli(binName: string, onLog: (s: string) => void): Promise<CliInstallResult> {
  const entry = CLI_PKGS[binName];
  if (commandExists(binName)) return { ok: true, bin: binName, source: "system", authHint: entry?.auth };
  const existingManaged = resolveManagedBin(binName);
  if (existingManaged) return { ok: true, bin: existingManaged, source: "managed", authHint: entry?.auth };
  if (!entry) return { ok: false, message: `Friday can't auto-install '${binName}'. Install it manually and ensure it's on your PATH.` };

  // Choose an installer that's actually present.
  let cmd: string | null = null;
  let viaNpm = false;
  if (entry.npm && commandExists("npm")) {
    mkdirSync(CLI_DIR, { recursive: true });
    const pkgJson = path.join(CLI_DIR, "package.json");
    if (!existsSync(pkgJson)) writeFileSync(pkgJson, JSON.stringify({ name: "friday-clis", private: true, version: "1.0.0" }), "utf8");
    cmd = `npm install ${entry.npm} --prefix "${CLI_DIR}" --no-fund --no-audit`;
    viaNpm = true;
  } else if (entry.uv && commandExists("uv")) {
    cmd = `uv tool install ${entry.uv}`;
  } else if (entry.pip && commandExists("pip")) {
    cmd = `pip install ${entry.pip}`;
  }
  if (!cmd) {
    const opts = [entry.npm && "npm", entry.uv && "uv", entry.pip && "pip"].filter(Boolean).join("/");
    const manual = entry.uv ? `Install it yourself: \`uv tool install ${entry.uv}\` or \`pip install ${entry.pip}\`.` : "Install it manually.";
    return { ok: false, message: `No installer found (need ${opts}). ${manual}`, authHint: entry.auth };
  }

  onLog(`Installing ${entry.npm ?? entry.uv ?? entry.pip}…`);
  const { code, tail } = await runInstall(cmd, onLog);
  if (code !== 0) return { ok: false, message: `Install failed (exit ${code})${tail ? `: ${tail}` : ""}`, authHint: entry.auth };

  if (viaNpm) {
    const mb = resolveManagedBin(binName);
    if (!mb) return { ok: false, message: `Installed, but couldn't find the ${binName} binary.`, authHint: entry.auth };
    return { ok: true, bin: mb, source: "managed", authHint: entry.auth };
  }
  // uv/pip put the bin on PATH
  if (!commandExists(binName)) return { ok: false, message: `Installed ${binName}, but it isn't on your PATH yet - restart Friday (or add the tool's bin dir to PATH).`, authHint: entry.auth };
  return { ok: true, bin: binName, source: "system", authHint: entry.auth };
}
