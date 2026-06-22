// ToolActivity - the AI-first crown jewel. Tool calls (file edits, command
// output, searches) render as compact, COLLAPSED cards. The developer expands a
// card only when they want to "dig deeper". The expanded panel renders a full
// discriminated-union view on view.meta.kind: diff / file / command / list /
// search / glob / todos / text - with per-line diff colouring, command
// stdout/stderr, and click-to-open (setOpenFile) for search/glob results.

import { useState } from "react";
import { useFriday, type ToolView } from "@/store";
import type { Todo, ToolMeta } from "@/lib/api";

// ---------------------------------------------------------------------------
// Inline SVG icons (no icon library exists - draw everything locally).
// ---------------------------------------------------------------------------
type IconProps = { className?: string };
const ico = "h-3.5 w-3.5 shrink-0";

function EyeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? ico}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function PlusDocIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? ico}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M12 12v5M9.5 14.5h5" />
    </svg>
  );
}
function PencilIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? ico}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function FolderIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? ico}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}
function FileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? ico}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}
function SearchFilesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? ico}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
      <path d="M14 3v5h5" />
      <circle cx="16.5" cy="15.5" r="3" />
      <path d="m21 20-2.2-2.2" />
    </svg>
  );
}
function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? ico}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function TerminalIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? ico}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3M13 15h4" />
    </svg>
  );
}
function ChecklistIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? ico}>
      <path d="m3 6 1.5 1.5L7 5" />
      <path d="m3 13 1.5 1.5L7 12" />
      <path d="m3 20 1.5 1.5L7 19" />
      <path d="M11 6h10M11 13h10M11 20h10" />
    </svg>
  );
}
function GearIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? ico}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.65.65 1.15 1.31 1.31H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
function ChevronIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

/** Pick a tool icon by tool name. */
function ToolIcon({ name }: { name: string }) {
  switch (name) {
    case "read_file": return <EyeIcon />;
    case "write_file": return <PlusDocIcon />;
    case "edit_file": return <PencilIcon />;
    case "list_directory": return <FolderIcon />;
    case "glob": return <SearchFilesIcon />;
    case "grep": return <SearchIcon />;
    case "run_command": return <TerminalIcon />;
    case "todo_write": return <ChecklistIcon />;
    default: return <GearIcon />;
  }
}

// ---------------------------------------------------------------------------
// Status indicator: running → pulsing accent dot, ok → accent check, error → red dot.
// ---------------------------------------------------------------------------
function StatusDot({ status }: { status: ToolView["status"] }) {
  if (status === "running") {
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-pulse" aria-label="running" />;
  }
  if (status === "error") {
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" aria-label="error" />;
  }
  return <CheckIcon className="h-3.5 w-3.5 shrink-0 text-accent" />;
}

// ---------------------------------------------------------------------------
// Compact header stat derived from view.meta.
// ---------------------------------------------------------------------------
function HeaderStat({ meta }: { meta?: ToolMeta }) {
  if (!meta) return null;
  switch (meta.kind) {
    case "diff":
      return (
        <span className="flex items-center gap-1.5 tabular-nums">
          {meta.created && (
            <span className="rounded-sm border border-accent/40 bg-accent/10 px-1 text-[9px] uppercase tracking-bespoke-caps text-accent">new</span>
          )}
          <span className="text-emerald-400">+{meta.added}</span>
          <span className="text-red-400">−{meta.removed}</span>
        </span>
      );
    case "command":
      return (
        <span className={`tabular-nums ${meta.exitCode !== 0 ? "text-red-400" : "text-muted-foreground"}`}>
          exit {meta.exitCode}
        </span>
      );
    case "search":
      return <span className="tabular-nums text-muted-foreground">{meta.matches.length} hits</span>;
    case "glob":
      return <span className="tabular-nums text-muted-foreground">{meta.files.length} files</span>;
    case "list":
      return <span className="tabular-nums text-muted-foreground">{meta.entries.length} items</span>;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Expanded-panel sub-views (one per ToolMeta.kind).
// ---------------------------------------------------------------------------
const PATH_HEADER =
  "flex items-center gap-1.5 border-b border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground";
const PRE = "max-h-80 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed";

function DiffView({ meta }: { meta: Extract<ToolMeta, { kind: "diff" }> }) {
  const lines = meta.diff.split("\n");
  return (
    <div>
      <div className={PATH_HEADER}>
        <FileIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{meta.path}</span>
        {meta.created && (
          <span className="ml-auto rounded-sm border border-accent/40 bg-accent/10 px-1 text-[9px] uppercase tracking-bespoke-caps text-accent">created</span>
        )}
      </div>
      <pre className={PRE}>
        {lines.map((line, i) => {
          const isMeta = /^(@@|diff |index |--- |\+\+\+ )/.test(line);
          const cls = isMeta
            ? "text-muted-foreground/70"
            : line.startsWith("+")
            ? "text-emerald-400"
            : line.startsWith("-")
            ? "text-red-400"
            : "text-muted-foreground";
          return (
            <div key={i} className={`whitespace-pre ${cls}`}>
              {line || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function FileView({ meta }: { meta: Extract<ToolMeta, { kind: "file" }> }) {
  return (
    <div>
      <div className={PATH_HEADER}>
        <FileIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{meta.path}</span>
        {meta.language && <span className="ml-auto uppercase tracking-bespoke-caps text-[9px]">{meta.language}</span>}
      </div>
      <pre className={`${PRE} whitespace-pre text-foreground`}>{meta.content}</pre>
      {meta.truncated && (
        <div className="border-t border-border px-3 py-1 text-[10px] uppercase tracking-bespoke-caps text-muted-foreground">
          (truncated)
        </div>
      )}
    </div>
  );
}

function CommandView({ meta }: { meta: Extract<ToolMeta, { kind: "command" }> }) {
  const failed = meta.exitCode !== 0;
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="font-mono text-[11px] text-foreground">
          <span className="text-accent">$ </span>
          <span className="break-all">{meta.command}</span>
        </span>
        <span
          className={`ml-auto shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-bespoke-caps tabular-nums ${
            failed ? "border-red-400/40 bg-red-400/10 text-red-400" : "border-border bg-secondary text-muted-foreground"
          }`}
        >
          exit {meta.exitCode}
        </span>
      </div>
      {(meta.stdout || meta.stderr) ? (
        <pre className={`${PRE} whitespace-pre-wrap`}>
          {meta.stdout && <span className="text-foreground">{meta.stdout}</span>}
          {meta.stdout && meta.stderr && "\n"}
          {meta.stderr && <span className="text-red-400">{meta.stderr}</span>}
        </pre>
      ) : (
        <div className="px-3 py-2 font-mono text-xs text-muted-foreground">(no output)</div>
      )}
    </div>
  );
}

function ListView({ meta }: { meta: Extract<ToolMeta, { kind: "list" }> }) {
  // Directories first, then files; each row a folder/file icon + name. Names
  // don't carry a full path, so rows are display-only (non-clickable).
  const entries = [...meta.entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return (
    <div>
      <div className={PATH_HEADER}>
        <FolderIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{meta.path || "."}</span>
      </div>
      <div className="max-h-80 overflow-auto py-1">
        {entries.length === 0 ? (
          <div className="px-3 py-2 font-mono text-xs text-muted-foreground">(empty)</div>
        ) : (
          entries.map((e) => (
            <div key={e.name} className="flex items-center gap-2 px-3 py-0.5 font-mono text-xs">
              {e.type === "dir" ? (
                <FolderIcon className="h-3 w-3 shrink-0 text-accent" />
              ) : (
                <FileIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span className={`truncate ${e.type === "dir" ? "text-foreground" : "text-muted-foreground"}`}>
                {e.name}
                {e.type === "dir" ? "/" : ""}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SearchView({ meta }: { meta: Extract<ToolMeta, { kind: "search" }> }) {
  const setOpenFile = useFriday().setOpenFile;
  return (
    <div>
      <div className={PATH_HEADER}>
        <SearchIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{meta.query}</span>
        <span className="ml-auto tabular-nums">{meta.matches.length} hits</span>
      </div>
      <div className="max-h-80 overflow-auto py-1">
        {meta.matches.length === 0 ? (
          <div className="px-3 py-2 font-mono text-xs text-muted-foreground">(no matches)</div>
        ) : (
          meta.matches.map((m, i) => (
            <button
              key={`${m.path}:${m.line}:${i}`}
              type="button"
              onClick={() => setOpenFile(m.path)}
              className="flex w-full items-baseline gap-2 px-3 py-0.5 text-left font-mono text-xs hover:bg-secondary/50"
              title={`Open ${m.path}`}
            >
              <span className="shrink-0 text-accent tabular-nums">
                {m.path}:{m.line}
              </span>
              <span className="truncate text-muted-foreground">{m.text}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function GlobView({ meta }: { meta: Extract<ToolMeta, { kind: "glob" }> }) {
  const setOpenFile = useFriday().setOpenFile;
  return (
    <div>
      <div className={PATH_HEADER}>
        <SearchFilesIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{meta.pattern}</span>
        <span className="ml-auto tabular-nums">{meta.files.length} files</span>
      </div>
      <div className="max-h-80 overflow-auto py-1">
        {meta.files.length === 0 ? (
          <div className="px-3 py-2 font-mono text-xs text-muted-foreground">(no files)</div>
        ) : (
          meta.files.map((path, i) => (
            <button
              key={`${path}:${i}`}
              type="button"
              onClick={() => setOpenFile(path)}
              className="flex w-full items-center gap-2 px-3 py-0.5 text-left font-mono text-xs text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              title={`Open ${path}`}
            >
              <FileIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{path}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function TodoMarker({ status }: { status: Todo["status"] }) {
  if (status === "completed") return <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />;
  if (status === "in_progress") return <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent animate-pulse" />;
  return <span className="mt-1 h-2 w-2 shrink-0 rounded-full border border-muted-foreground/60" />;
}

function TodosView({ meta }: { meta: Extract<ToolMeta, { kind: "todos" }> }) {
  return (
    <div className="max-h-80 overflow-auto px-3 py-2">
      {meta.todos.length === 0 ? (
        <div className="font-mono text-xs text-muted-foreground">(no items)</div>
      ) : (
        <ul className="space-y-1">
          {meta.todos.map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-xs">
              <TodoMarker status={t.status} />
              <span
                className={
                  t.status === "completed"
                    ? "text-muted-foreground line-through"
                    : t.status === "in_progress"
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {t.content}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TextView({ view }: { view: ToolView }) {
  if (!view.resultPreview) return null;
  return <pre className={`${PRE} whitespace-pre-wrap text-muted-foreground`}>{view.resultPreview}</pre>;
}

/** Body of the expanded panel - switches on view.meta?.kind. */
function ExpandedBody({ view }: { view: ToolView }) {
  const meta = view.meta;

  // Running with no meta yet → subtle shimmer.
  if (view.status === "running" && !meta) {
    return (
      <div className="px-3 py-3">
        <div className="h-3 w-2/5 animate-shimmer rounded-sm bg-secondary" />
        <div className="mt-2 font-mono text-[11px] text-muted-foreground">working…</div>
      </div>
    );
  }

  switch (meta?.kind) {
    case "diff": return <DiffView meta={meta} />;
    case "file": return <FileView meta={meta} />;
    case "command": return <CommandView meta={meta} />;
    case "list": return <ListView meta={meta} />;
    case "search": return <SearchView meta={meta} />;
    case "glob": return <GlobView meta={meta} />;
    case "todos": return <TodosView meta={meta} />;
    case "text":
    default:
      return <TextView view={view} />;
  }
}

// ---------------------------------------------------------------------------
// The card.
// ---------------------------------------------------------------------------
export function ToolActivity({ view }: { view: ToolView }) {
  const [expanded, setExpanded] = useState(false);

  // Whether there is anything to show when expanded.
  const hasBody =
    !!view.meta || !!view.resultPreview || view.status === "running";

  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-sm border border-border bg-secondary/40 px-2.5 py-1.5 text-left hover:border-accent"
      >
        <span className="shrink-0 text-muted-foreground">
          <ToolIcon name={view.name} />
        </span>
        <StatusDot status={view.status} />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{view.title}</span>
        <span className="ml-1 shrink-0 text-[11px]">
          <HeaderStat meta={view.meta} />
        </span>
        {hasBody && (
          <ChevronIcon
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {expanded && hasBody && (
        <div className="mt-1 overflow-hidden rounded-sm border border-border bg-card">
          <ExpandedBody view={view} />
        </div>
      )}
    </div>
  );
}
