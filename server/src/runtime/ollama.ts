// Managed local runtime. Friday runs open-source models locally WITHOUT asking the
// user to install anything: it reuses a system Ollama if present, otherwise it
// downloads the official standalone Ollama binary into the app's own data dir and
// runs `ollama serve` as a child process it controls (with its own model store).
//
// The Ollama engine (Apache-2.0, llama.cpp under the hood) is the embedded runtime;
// from the user's point of view there's no separate install - Friday provisions it.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, chmodSync, readdirSync } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import os from "node:os";
import { whichBin, FRIDAY_DIR } from "../util/proc.ts";

const ROOT = path.join(FRIDAY_DIR, "runtime");
const BIN_DIR = path.join(ROOT, "bin");
const MODELS_DIR = path.join(ROOT, "models");
export const OLLAMA_HOST = "127.0.0.1:11434";

let serveProc: ChildProcess | null = null;

function binName() { return process.platform === "win32" ? "ollama.exe" : "ollama"; }

/** Path to the managed binary if we've already provisioned it (layout varies by OS). */
function findManaged(): string | null {
  const fast = [path.join(BIN_DIR, binName()), path.join(BIN_DIR, "bin", binName())].find(existsSync);
  if (fast) return fast;
  return walkFor(BIN_DIR, binName(), 3); // macOS/linux tarballs may nest the binary
}

function walkFor(dir: string, name: string, depth: number): string | null {
  if (depth < 0 || !existsSync(dir)) return null;
  let entries: { name: string; isFile: () => boolean; isDirectory: () => boolean }[];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) if (e.isFile() && e.name === name) return path.join(dir, e.name);
  for (const e of entries) if (e.isDirectory()) { const f = walkFor(path.join(dir, e.name), name, depth - 1); if (f) return f; }
  return null;
}

/** System-installed ollama on PATH, if any. */
function findSystem(): string | null {
  return whichBin("ollama");
}

/** The ollama binary Friday will use (managed preferred, else system). */
export function ollamaBin(): string | null {
  return findManaged() ?? findSystem();
}

export function runtimeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, OLLAMA_HOST, OLLAMA_MODELS: MODELS_DIR };
}

async function serverUp(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(`http://${OLLAMA_HOST}/api/version`, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

function downloadUrl(): string {
  const base = "https://github.com/ollama/ollama/releases/latest/download/";
  if (process.platform === "win32") return base + "ollama-windows-amd64.zip";
  if (process.platform === "darwin") return base + "ollama-darwin.tgz";
  return base + (process.arch === "arm64" ? "ollama-linux-arm64.tgz" : "ollama-linux-amd64.tgz");
}

async function downloadRuntime(onLog: (s: string) => void): Promise<string> {
  mkdirSync(BIN_DIR, { recursive: true });
  const url = downloadUrl();
  const archive = path.join(ROOT, path.basename(url));
  onLog(`Downloading Friday's local runtime (one-time)… this can take a few minutes.`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length") || 0);
  let got = 0, lastPct = -1;
  const prog = new Transform({
    transform(chunk, _e, cb) {
      got += chunk.length;
      if (total) { const pct = Math.floor((got / total) * 100); if (pct >= lastPct + 5) { lastPct = pct; onLog(`Downloading runtime… ${pct}%`); } }
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as any), prog, createWriteStream(archive));

  onLog("Unpacking runtime…");
  // `tar` ships on modern Windows (bsdtar handles .zip) and on macOS/Linux (.tgz).
  let unpacked = spawnSync("tar", ["-xf", archive, "-C", BIN_DIR], { stdio: "ignore" }).status === 0;
  // Fallback for older Windows without bsdtar: PowerShell Expand-Archive (.zip only).
  if (!unpacked && process.platform === "win32" && archive.toLowerCase().endsWith(".zip")) {
    onLog("tar unavailable - using Expand-Archive…");
    unpacked = spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${BIN_DIR}' -Force`], { stdio: "ignore" }).status === 0;
  }
  if (!unpacked) throw new Error("could not unpack runtime (need tar, or Expand-Archive on Windows)");
  const bin = findManaged();
  if (!bin) throw new Error("runtime binary not found after unpack");
  if (process.platform !== "win32") { try { chmodSync(bin, 0o755); } catch { /* ignore */ } }
  return bin;
}

export interface RuntimeResult { ok: boolean; bin?: string; source: "system" | "managed"; message?: string }

/**
 * Ensure a local model server is running. Returns the bin to use for pull/run.
 * Downloads the managed runtime on first use if nothing is available.
 */
export async function ensureRuntime(onLog: (s: string) => void): Promise<RuntimeResult> {
  // Something already serving on the default port (e.g. the user's own Ollama)? Reuse it.
  if (await serverUp()) {
    return { ok: true, bin: ollamaBin() ?? "ollama", source: findManaged() ? "managed" : "system" };
  }

  let bin = ollamaBin();
  let source: "system" | "managed" = bin && findManaged() === bin ? "managed" : (bin ? "system" : "managed");
  if (!bin) {
    try { bin = await downloadRuntime(onLog); source = "managed"; }
    catch (e) {
      return { ok: false, source: "managed", message: `Couldn't set up the bundled runtime (${(e as Error).message}). As a fallback you can install Ollama from https://ollama.com.` };
    }
  }

  try {
    mkdirSync(MODELS_DIR, { recursive: true });
    onLog("Starting local runtime…");
    serveProc = spawn(bin, ["serve"], { env: runtimeEnv(), stdio: "ignore" });
    serveProc.on("exit", () => { serveProc = null; });
    for (let i = 0; i < 40; i++) {
      if (await serverUp()) return { ok: true, bin, source };
      await new Promise((r) => setTimeout(r, 500));
    }
    return { ok: false, source, message: "Local runtime didn't come up in time." };
  } catch (e) {
    return { ok: false, source, message: (e as Error).message };
  }
}

export async function runtimeStatus() {
  return {
    serverUp: await serverUp(),
    hasManaged: !!findManaged(),
    hasSystem: !!findSystem(),
    host: OLLAMA_HOST,
    modelsDir: MODELS_DIR,
    totalMemGB: Math.round(os.totalmem() / 1e9),
    cpus: os.cpus().length,
  };
}

export interface InstalledModel { name: string; sizeGB: number }

/** List pulled local models (via the Ollama tags API). Starts the engine if a bin exists. */
export async function listModels(): Promise<{ running: boolean; models: InstalledModel[] }> {
  let up = await serverUp();
  if (!up && (findManaged() || findSystem())) { await ensureRuntime(() => {}); up = await serverUp(); }
  if (!up) return { running: false, models: [] };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`http://${OLLAMA_HOST}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    const j: any = await r.json();
    const models: InstalledModel[] = (j.models ?? []).map((m: any) => ({ name: m.name, sizeGB: Math.round((m.size / 1e9) * 10) / 10 }));
    models.sort((a, b) => a.name.localeCompare(b.name));
    return { running: true, models };
  } catch { return { running: up, models: [] }; }
}

export async function removeModel(tag: string): Promise<{ ok: boolean; message?: string }> {
  if (!(await serverUp())) return { ok: false, message: "Local engine isn't running." };
  try {
    const r = await fetch(`http://${OLLAMA_HOST}/api/delete`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: tag }) });
    if (!r.ok) return { ok: false, message: `Delete failed (HTTP ${r.status})` };
    return { ok: true };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export function shutdownRuntime() {
  try { serveProc?.kill(); } catch { /* ignore */ }
  serveProc = null;
}
