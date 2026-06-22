// "Dig deeper" explorer + viewer. A lazy file tree (api.fsTree) over the project
// root and a syntax-highlighted file viewer (api.fsFile) that reacts to openFile.
// Code is hidden by default in Friday - this is where the developer digs in.

import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useFriday } from "@/store";
import { api } from "@/lib/api";

type FsEntry = { name: string; type: "file" | "dir"; path: string };

// ---- icons -------------------------------------------------------------
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
function FolderIcon({ open, className }: { open?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      {open ? (
        <path d="M1.7 5.5h12.6l-1.4 7.2a1 1 0 0 1-1 .8H3.5a1 1 0 0 1-1-.8L1.7 5.5zM2 5.5V4.3a1 1 0 0 1 1-1h3l1.4 1.6h5a1 1 0 0 1 1 1v.1" />
      ) : (
        <path d="M2 4.3a1 1 0 0 1 1-1h3l1.4 1.6h5.6a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.3z" />
      )}
    </svg>
  );
}
function FileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 1.8h5l3 3v9a.7.7 0 0 1-.7.7H4a.7.7 0 0 1-.7-.7V2.5A.7.7 0 0 1 4 1.8z" />
      <path d="M9 1.8v3h3" />
    </svg>
  );
}
function ChevronIcon({ open, className }: { open?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`${className ?? ""} transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function sortEntries(entries: FsEntry[]): FsEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function CodePanel() {
  const { toggleCodePanel, openFile, setOpenFile } = useFriday();

  // tree state: lazy children cache keyed by directory path, plus open dir set.
  const [children, setChildren] = useState<Record<string, FsEntry[]>>({});
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [treeError, setTreeError] = useState<string | null>(null);

  const ROOT = "";

  const loadDir = useCallback(async (path: string) => {
    setLoadingDirs((s) => new Set(s).add(path));
    try {
      const res = await api.fsTree(path || undefined);
      setChildren((c) => ({ ...c, [path]: sortEntries(res.entries) }));
      setTreeError(null);
    } catch (e) {
      setTreeError((e as Error).message || "Failed to read directory");
    } finally {
      setLoadingDirs((s) => {
        const n = new Set(s);
        n.delete(path);
        return n;
      });
    }
  }, []);

  // load the root tree on mount
  useEffect(() => {
    if (children[ROOT] === undefined) void loadDir(ROOT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDir = useCallback(
    (path: string) => {
      setOpenDirs((s) => {
        const n = new Set(s);
        if (n.has(path)) {
          n.delete(path);
        } else {
          n.add(path);
          if (children[path] === undefined) void loadDir(path);
        }
        return n;
      });
    },
    [children, loadDir],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 h-12 flex items-center justify-between border-b border-sidebar-border shrink-0">
        <span className="text-[11px] font-medium uppercase tracking-bespoke-caps text-accent">Code</span>
        <button
          onClick={toggleCodePanel}
          className="h-7 w-7 grid place-items-center rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-accent transition-colors"
          aria-label="Close code panel"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {/* tree */}
      <div className="h-1/3 min-h-[160px] overflow-auto border-b border-sidebar-border p-2">
        {treeError ? (
          <div className="px-2 py-1 text-xs text-red-400">{treeError}</div>
        ) : (
          <Tree
            path={ROOT}
            depth={0}
            children={children}
            openDirs={openDirs}
            loadingDirs={loadingDirs}
            openFile={openFile}
            onToggleDir={toggleDir}
            onOpenFile={setOpenFile}
          />
        )}
      </div>

      {/* viewer */}
      <div className="flex-1 overflow-auto">
        <Viewer openFile={openFile} />
      </div>
    </div>
  );
}

function Tree({
  path,
  depth,
  children,
  openDirs,
  loadingDirs,
  openFile,
  onToggleDir,
  onOpenFile,
}: {
  path: string;
  depth: number;
  children: Record<string, FsEntry[]>;
  openDirs: Set<string>;
  loadingDirs: Set<string>;
  openFile: string | null;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const entries = children[path];

  if (entries === undefined) {
    return loadingDirs.has(path) ? (
      <div className="px-2 py-1 text-[11px] text-muted-foreground animate-pulse">Loading…</div>
    ) : null;
  }
  if (entries.length === 0) {
    return depth === 0 ? <div className="px-2 py-1 text-[11px] text-muted-foreground">Empty.</div> : null;
  }

  return (
    <ul className="select-none">
      {entries.map((entry) => {
        const isOpen = openDirs.has(entry.path);
        const isActive = openFile === entry.path;
        return (
          <li key={entry.path}>
            <button
              onClick={() => (entry.type === "dir" ? onToggleDir(entry.path) : onOpenFile(entry.path))}
              className={`group flex w-full items-center gap-1.5 rounded-sm py-1 pr-2 text-left text-xs transition-colors hover:bg-secondary/60 ${
                isActive ? "bg-secondary text-accent" : "text-foreground"
              }`}
              style={{ paddingLeft: `${depth * 14 + 6}px` }}
            >
              {entry.type === "dir" ? (
                <ChevronIcon open={isOpen} className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <span className="w-3 shrink-0" />
              )}
              {entry.type === "dir" ? (
                <FolderIcon open={isOpen} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FileIcon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-accent" : "text-muted-foreground"}`} />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
            {entry.type === "dir" && isOpen && (
              <Tree
                path={entry.path}
                depth={depth + 1}
                children={children}
                openDirs={openDirs}
                loadingDirs={loadingDirs}
                openFile={openFile}
                onToggleDir={onToggleDir}
                onOpenFile={onOpenFile}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Viewer({ openFile }: { openFile: string | null }) {
  const [file, setFile] = useState<{ path: string; content: string; language: string; truncated: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!openFile) {
      setFile(null);
      setError(null);
      return;
    }
    const seq = ++reqRef.current;
    setLoading(true);
    setError(null);
    api
      .fsFile(openFile)
      .then((res) => {
        if (reqRef.current !== seq) return; // a newer request superseded this one
        setFile(res);
      })
      .catch((e) => {
        if (reqRef.current !== seq) return;
        setError((e as Error).message || "Failed to read file");
        setFile(null);
      })
      .finally(() => {
        if (reqRef.current === seq) setLoading(false);
      });
  }, [openFile]);

  if (!openFile) {
    return <div className="grid h-full place-items-center p-6 text-xs text-muted-foreground">Select a file to inspect.</div>;
  }
  if (loading && !file) {
    return <div className="p-4 text-xs text-muted-foreground animate-pulse">Loading {openFile}…</div>;
  }
  if (error) {
    return (
      <div className="p-4">
        <div className="mb-2 truncate font-mono text-[11px] text-muted-foreground">{openFile}</div>
        <div className="text-xs text-red-400">{error}</div>
      </div>
    );
  }
  if (!file) return null;

  // Wrap the content in a fenced code block so rehype-highlight colours it by language.
  const fence = "```" + (file.language || "") + "\n" + file.content + "\n```";

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2 truncate font-mono text-[11px] text-muted-foreground">
        <FileIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="truncate">{file.path}</span>
        {file.truncated && <span className="shrink-0 text-[10px] uppercase tracking-bespoke-caps text-accent">(truncated)</span>}
      </div>
      <div className="prose-friday">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {fence}
        </Markdown>
      </div>
    </div>
  );
}
