import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Single, stable home for all of Friday's local data (config, workspace, managed
// runtime/CLIs). Defaults to `.friday` in the launch dir (unchanged), but set
// FRIDAY_HOME to pin it to a fixed location for packaged/multi-user setups.
export const FRIDAY_DIR = process.env.FRIDAY_HOME
  ? path.resolve(process.env.FRIDAY_HOME)
  : path.resolve(process.cwd(), ".friday");

// Cross-platform, locale-proof command resolution. Single source of truth so
// Windows/Linux/macOS behave the same. On Windows we run `where` from a NEUTRAL
// cwd (so a stray same-named file in the working dir can't false-positive) and
// validate the resolved path actually exists.

function winNeutralCwd(): string {
  return process.env.SystemRoot || process.env.windir || os.tmpdir();
}

/** Absolute path of a command on PATH (or null). Accepts an absolute/relative path too. */
export function whichBin(bin: string): string | null {
  if (/[\\/]/.test(bin)) return existsSync(bin) ? bin : null;
  try {
    if (process.platform === "win32") {
      const r = spawnSync("where", [bin], { cwd: winNeutralCwd(), encoding: "utf8" });
      if (r.status !== 0) return null;
      const first = String(r.stdout).split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      return first && existsSync(first) ? first : null;
    }
    const r = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" });
    const out = String(r.stdout).trim().split(/\r?\n/)[0];
    return r.status === 0 && out ? out : null;
  } catch { return null; }
}

/** Whether a command is available (PATH or an explicit path). */
export function commandExists(bin: string): boolean {
  return whichBin(bin) !== null;
}
