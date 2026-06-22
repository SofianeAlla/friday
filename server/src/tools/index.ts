import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { ToolSpec } from "../providers/types.ts";
import type { ToolContext, ToolMeta, ToolResult, Todo } from "./types.ts";

// =============================================================================
// Friday's tool belt - the same capabilities a terminal coding agent has, but
// every result also carries `meta` so the UI can show a rich (collapsed) view.
// =============================================================================

const MAX_READ = 400_000; // bytes returned to the model
const MAX_OUTPUT = 60_000; // command stdout/stderr cap
const CMD_TIMEOUT = 120_000;

export const TOOLS: ToolSpec[] = [
  {
    name: "read_file",
    description: "Read a file from the working directory. Optionally start at a line offset and limit the number of lines.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path (relative to the working directory or absolute)." },
        offset: { type: "number", description: "1-based line to start from (optional)." },
        limit: { type: "number", description: "Max lines to read (optional)." },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Create a new file or overwrite an existing one with the given content.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Replace an exact string in a file. old_string must match exactly and uniquely unless replace_all is true.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
        replace_all: { type: "boolean" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "list_directory",
    description: "List the entries (files and folders) of a directory.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Directory path. Defaults to the working directory." } },
      required: [],
    },
  },
  {
    name: "glob",
    description: "Find files matching a glob pattern (e.g. src/**/*.ts). Returns matching paths.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string", description: "Base directory (optional)." },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep",
    description: "Search file contents with a regular expression. Returns matching lines with file and line number.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression." },
        path: { type: "string", description: "Base directory (optional)." },
        glob: { type: "string", description: "Restrict to files matching this glob (optional)." },
      },
      required: ["pattern"],
    },
  },
  {
    name: "run_command",
    description: "Run a shell command in the working directory and return its output. Use for builds, tests, git, installers, etc.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string", description: "Directory to run in (optional)." },
      },
      required: ["command"],
    },
  },
  {
    name: "todo_write",
    description: "Create or update the task plan shown to the user. Pass the full list each time.",
    input_schema: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"] },
            },
            required: ["content", "status"],
          },
        },
      },
      required: ["todos"],
    },
  },
];

// ---------------------------------------------------------------- helpers

const LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", json: "json",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", c: "c", h: "c",
  cpp: "cpp", cc: "cpp", cs: "csharp", php: "php", sh: "bash", bash: "bash",
  yml: "yaml", yaml: "yaml", toml: "toml", md: "markdown", html: "html",
  css: "css", scss: "scss", sql: "sql", swift: "swift", kt: "kotlin",
};
function langOf(p: string): string { return LANG[p.split(".").pop()?.toLowerCase() || ""] || "text"; }

function resolveIn(ctx: ToolContext, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(ctx.cwd, p);
}
function rel(ctx: ToolContext, p: string): string {
  const r = path.relative(ctx.cwd, p);
  return r && !r.startsWith("..") ? r.split(path.sep).join("/") : p;
}

/** Tiny LCS line diff → unified-ish text + counts. Capped for large files. */
function lineDiff(oldText: string, newText: string): { diff: string; added: number; removed: number } {
  const a = oldText.length ? oldText.split("\n") : [];
  const b = newText.length ? newText.split("\n") : [];
  if (a.length > 6000 || b.length > 6000) {
    return { diff: `@@ large change @@\n- ${a.length} lines\n+ ${b.length} lines`, added: b.length, removed: a.length };
  }
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: { t: " " | "-" | "+"; line: string }[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { ops.push({ t: " ", line: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "-", line: a[i] }); i++; }
    else { ops.push({ t: "+", line: b[j] }); j++; }
  }
  while (i < m) { ops.push({ t: "-", line: a[i++] }); }
  while (j < n) { ops.push({ t: "+", line: b[j++] }); }

  const added = ops.filter((o) => o.t === "+").length;
  const removed = ops.filter((o) => o.t === "-").length;
  // collapse long runs of context
  const out: string[] = [];
  let ctxRun = 0;
  for (const o of ops) {
    if (o.t === " ") {
      ctxRun++;
      if (ctxRun <= 3) out.push(`  ${o.line}`);
      else if (ctxRun === 4) out.push("  …");
    } else {
      ctxRun = 0;
      out.push(`${o.t} ${o.line}`);
    }
  }
  return { diff: out.join("\n").slice(0, 20_000), added, removed };
}

function clip(s: string, n = MAX_OUTPUT): string {
  return s.length > n ? s.slice(0, n) + `\n… [truncated ${s.length - n} chars]` : s;
}

// ---------------------------------------------------------------- executor

export async function executeTool(
  name: string,
  input: Record<string, any>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "read_file": return await readFile(input, ctx);
      case "write_file": return await writeFile(input, ctx);
      case "edit_file": return await editFile(input, ctx);
      case "list_directory": return await listDir(input, ctx);
      case "glob": return await globTool(input, ctx);
      case "grep": return await grepTool(input, ctx);
      case "run_command": return await runCommand(input, ctx);
      case "todo_write": return todoWrite(input, ctx);
      default: return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (e) {
    return { content: `Error in ${name}: ${(e as Error).message}`, isError: true };
  }
}

async function readFile(input: any, ctx: ToolContext): Promise<ToolResult> {
  const abs = resolveIn(ctx, input.path);
  let text = await fs.readFile(abs, "utf8");
  let truncated = false;
  if (input.offset || input.limit) {
    const lines = text.split(/\r?\n/);
    const start = Math.max(0, (Number(input.offset) || 1) - 1);
    const end = input.limit ? start + Number(input.limit) : lines.length;
    text = lines.slice(start, end).join("\n");
  }
  if (text.length > MAX_READ) { text = text.slice(0, MAX_READ); truncated = true; }
  const meta: ToolMeta = { kind: "file", path: rel(ctx, abs), language: langOf(abs), content: text, truncated };
  return { content: text || "(empty file)", meta };
}

async function writeFile(input: any, ctx: ToolContext): Promise<ToolResult> {
  const abs = resolveIn(ctx, input.path);
  const display = rel(ctx, abs);
  let prev = "";
  let created = false;
  try { prev = await fs.readFile(abs, "utf8"); } catch { created = true; }
  const ok = await ctx.requestPermission({
    id: "", toolName: "write_file",
    title: `${created ? "Create" : "Overwrite"} ${display}`,
    detail: created ? `Create a new file (${String(input.content ?? "").length} chars).` : `Overwrite the existing file.`,
  });
  if (!ok) return { content: "Denied by user.", denied: true, isError: true };
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, String(input.content ?? ""), "utf8");
  const d = lineDiff(prev, String(input.content ?? ""));
  const meta: ToolMeta = { kind: "diff", path: display, diff: d.diff, added: d.added, removed: d.removed, created };
  return { content: `${created ? "Created" : "Wrote"} ${display} (+${d.added} -${d.removed}).`, meta };
}

async function editFile(input: any, ctx: ToolContext): Promise<ToolResult> {
  const abs = resolveIn(ctx, input.path);
  const display = rel(ctx, abs);
  const prev = await fs.readFile(abs, "utf8");
  const oldStr = String(input.old_string ?? "");
  const newStr = String(input.new_string ?? "");
  const count = oldStr ? prev.split(oldStr).length - 1 : 0;
  if (count === 0) return { content: `old_string not found in ${display}.`, isError: true };
  if (count > 1 && !input.replace_all)
    return { content: `old_string occurs ${count} times in ${display}; pass replace_all or make it unique.`, isError: true };
  const ok = await ctx.requestPermission({
    id: "", toolName: "edit_file", title: `Edit ${display}`,
    detail: input.replace_all ? `Replace all ${count} occurrence(s).` : `Replace 1 occurrence.`,
  });
  if (!ok) return { content: "Denied by user.", denied: true, isError: true };
  const next = input.replace_all ? prev.split(oldStr).join(newStr) : prev.replace(oldStr, newStr);
  await fs.writeFile(abs, next, "utf8");
  const d = lineDiff(prev, next);
  const meta: ToolMeta = { kind: "diff", path: display, diff: d.diff, added: d.added, removed: d.removed };
  return { content: `Edited ${display} (+${d.added} -${d.removed}).`, meta };
}

async function listDir(input: any, ctx: ToolContext): Promise<ToolResult> {
  const abs = resolveIn(ctx, input.path || ".");
  const names = await fs.readdir(abs, { withFileTypes: true });
  const entries = await Promise.all(names
    .filter((d) => d.name !== "node_modules" && !d.name.startsWith(".git"))
    .map(async (d) => {
      let size: number | undefined;
      if (d.isFile()) { try { size = (await fs.stat(path.join(abs, d.name))).size; } catch { /* noop */ } }
      return { name: d.name, type: d.isDirectory() ? ("dir" as const) : ("file" as const), size };
    }));
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  const listing = entries.map((e) => (e.type === "dir" ? `${e.name}/` : e.name)).join("\n");
  const meta: ToolMeta = { kind: "list", path: rel(ctx, abs), entries };
  return { content: listing || "(empty)", meta };
}

async function globTool(input: any, ctx: ToolContext): Promise<ToolResult> {
  const base = resolveIn(ctx, input.path || ".");
  const files = await fg(input.pattern, { cwd: base, ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"], dot: false, onlyFiles: true });
  files.sort();
  const capped = files.slice(0, 500);
  const meta: ToolMeta = { kind: "glob", pattern: input.pattern, files: capped };
  return { content: capped.length ? capped.join("\n") : "No files matched.", meta };
}

async function grepTool(input: any, ctx: ToolContext): Promise<ToolResult> {
  const base = resolveIn(ctx, input.path || ".");
  const pattern = new RegExp(input.pattern, "i");
  const files = await fg(input.glob || "**/*", {
    cwd: base, ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/*.lock", "**/*.min.*"],
    onlyFiles: true, dot: false,
  });
  const matches: { path: string; line: number; text: string }[] = [];
  for (const f of files) {
    if (matches.length >= 200) break;
    const abs = path.join(base, f);
    let text: string;
    try {
      const st = await fs.stat(abs);
      if (st.size > 2_000_000) continue;
      text = await fs.readFile(abs, "utf8");
    } catch { continue; }
    const lines = text.split(/\r?\n/); // CRLF-safe so $-anchored patterns match cross-OS
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        matches.push({ path: f.split(path.sep).join("/"), line: i + 1, text: lines[i].trim().slice(0, 240) });
        if (matches.length >= 200) break;
      }
    }
  }
  const meta: ToolMeta = { kind: "search", query: input.pattern, matches };
  const body = matches.map((m) => `${m.path}:${m.line}: ${m.text}`).join("\n");
  return { content: matches.length ? body : `No matches for /${input.pattern}/.`, meta };
}

async function runCommand(input: any, ctx: ToolContext): Promise<ToolResult> {
  const command = String(input.command ?? "").trim();
  if (!command) return { content: "Empty command.", isError: true };
  const cwd = input.cwd ? resolveIn(ctx, input.cwd) : ctx.cwd;
  const ok = await ctx.requestPermission({
    id: "", toolName: "run_command", title: `Run: ${command.length > 60 ? command.slice(0, 60) + "…" : command}`,
    detail: `In ${rel(ctx, cwd) || "."}`,
  });
  if (!ok) return { content: "Denied by user.", denied: true, isError: true };

  return await new Promise<ToolResult>((resolve) => {
    const child = spawn(command, { cwd, shell: true, env: process.env });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { try { child.kill(); } catch { /* noop */ } }, CMD_TIMEOUT);
    child.stdout?.on("data", (d) => { stdout += d; });
    child.stderr?.on("data", (d) => { stderr += d; });
    const onAbort = () => { try { child.kill(); } catch { /* noop */ } };
    ctx.signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ content: `Failed to run: ${err.message}`, isError: true,
        meta: { kind: "command", command, stdout: "", stderr: err.message, exitCode: -1 } });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", onAbort);
      const exitCode = code ?? 0;
      const meta: ToolMeta = { kind: "command", command, stdout: clip(stdout), stderr: clip(stderr), exitCode };
      const combined = [stdout && clip(stdout), stderr && `[stderr]\n${clip(stderr)}`].filter(Boolean).join("\n");
      resolve({
        content: `$ ${command}\n(exit ${exitCode})\n${combined || "(no output)"}`,
        isError: exitCode !== 0,
        meta,
      });
    });
  });
}

function todoWrite(input: any, ctx: ToolContext): ToolResult {
  const todos: Todo[] = (input.todos || []).map((t: any, i: number) => ({
    id: String(i), content: String(t.content), status: t.status || "pending",
  }));
  ctx.setTodos(todos);
  const meta: ToolMeta = { kind: "todos", todos };
  const summary = todos.map((t) => `${t.status === "completed" ? "[x]" : t.status === "in_progress" ? "[~]" : "[ ]"} ${t.content}`).join("\n");
  return { content: `Updated plan:\n${summary}`, meta };
}

export function toolTitle(name: string, input: Record<string, any>): string {
  const p = (k: string) => String(input?.[k] ?? "");
  switch (name) {
    case "read_file": return `Read ${p("path")}`;
    case "write_file": return `Write ${p("path")}`;
    case "edit_file": return `Edit ${p("path")}`;
    case "list_directory": return `List ${p("path") || "."}`;
    case "glob": return `Find ${p("pattern")}`;
    case "grep": return `Search "${p("pattern")}"`;
    case "run_command": return `Run ${p("command").slice(0, 70)}`;
    case "todo_write": return "Update plan";
    default: return name;
  }
}

/** Destructive tools that should be gated in "ask" mode. */
export const GATED_TOOLS = new Set(["write_file", "edit_file", "run_command"]);
