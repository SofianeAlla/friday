// Friday's single source of UI truth. Holds the canonical transcript, the live
// streaming assistant message, per-tool render views (titles/diffs/output kept
// collapsed by default), todos, the active provider, settings, and the
// dig-deeper code panel. Components stay thin and just read this.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  api,
  type AgentEvent,
  type AppState,
  type BalanceInfo,
  type ConversationMeta,
  type Message,
  type Meter,
  type PermissionRequest,
  type Project,
  type ProviderConfig,
  type Settings,
  type Todo,
  type ToolMeta,
} from "@/lib/api";

const EMPTY_METER: Meter = {
  model: null, providerLabel: null, kind: null, contextWindow: 0, contextUsed: 0, contextPct: 0,
  estimated: true, inputTokens: 0, outputTokens: 0, turns: 0, pricing: null, cost: null, free: false, billing: "api", balanceSupported: false,
};
import { applyAccent, applyMode } from "@/lib/theme";

export interface ToolView {
  id: string;
  name: string;
  title: string;
  input: Record<string, unknown>;
  status: "running" | "ok" | "error";
  resultPreview?: string;
  meta?: ToolMeta;
}

export type View = "chat" | "barn" | "benchmarks";

export interface FridayStore {
  ready: boolean;
  error: string | null;
  platform: string;
  view: View;
  setView: (v: View) => void;
  refresh: () => Promise<void>;
  // config
  providers: ProviderConfig[];
  presets: AppState["presets"];
  activeProviderId: string | null;
  activeProvider: ProviderConfig | null;
  settings: Settings;
  // projects (repos) & conversations
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  conversations: ConversationMeta[];
  activeConversationId: string | null;
  addProject: (path: string, name?: string) => Promise<void>;
  setActiveProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  newConversation: () => Promise<void>;
  setActiveConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  // conversation
  messages: Message[];
  live: { text: string; toolIds: string[]; providerLabel?: string } | null;
  tools: Record<string, ToolView>;
  todos: Todo[];
  streaming: boolean;
  pendingPermission: PermissionRequest | null;
  // usage / cost
  meter: Meter;
  liveUsage: { input: number; output: number } | null;
  balance: BalanceInfo | null;
  checkBalance: () => Promise<void>;
  // dig-deeper
  codePanelOpen: boolean;
  openFile: string | null;
  // panels
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  gitOpen: boolean;
  setGitOpen: (v: boolean) => void;
  importOpen: boolean;
  setImportOpen: (v: boolean) => void;
  compactionNote: string | null;
  // actions
  send: (text: string) => void;
  stop: () => void;
  reset: () => void;
  setActive: (id: string) => Promise<void>;
  addProvider: (cfg: Partial<ProviderConfig>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  resolvePermission: (id: string, allowed: boolean) => void;
  toggleCodePanel: () => void;
  setOpenFile: (path: string | null) => void;
  dismissError: () => void;
}

const Ctx = createContext<FridayStore | null>(null);

export function clientToolTitle(name: string, input: Record<string, unknown>): string {
  const p = (k: string) => String((input?.[k] as string) ?? "");
  switch (name) {
    case "read_file": return `Read ${p("path")}`;
    case "write_file": return `Write ${p("path")}`;
    case "edit_file": return `Edit ${p("path")}`;
    case "list_directory": return `List ${p("path") || "."}`;
    case "glob": return `Find ${p("pattern")}`;
    case "grep": return `Search "${p("pattern")}"`;
    case "run_command": return `Run ${p("command")}`;
    case "todo_write": return "Update plan";
    default: return name;
  }
}

/** Rebuild tool views from a loaded transcript (used on cold load / reset). */
function toolsFromMessages(messages: Message[]): Record<string, ToolView> {
  const views: Record<string, ToolView> = {};
  const results: Record<string, { content: string; isError?: boolean }> = {};
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type === "tool_result") results[b.tool_use_id] = { content: b.content, isError: b.is_error };
    }
  }
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type === "tool_use") {
        const r = results[b.id];
        views[b.id] = {
          id: b.id, name: b.name, input: b.input,
          title: clientToolTitle(b.name, b.input),
          status: r ? (r.isError ? "error" : "ok") : "ok",
          resultPreview: r?.content?.slice(0, 4000),
        };
      }
    }
  }
  return views;
}

export function FridayProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [presets, setPresets] = useState<AppState["presets"]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({ cwd: "", permissionMode: "auto" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [live, setLive] = useState<FridayStore["live"]>(null);
  const [tools, setTools] = useState<Record<string, ToolView>>({});
  const [todos, setTodos] = useState<Todo[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [meter, setMeter] = useState<Meter>(EMPTY_METER);
  const [liveUsage, setLiveUsage] = useState<{ input: number; output: number } | null>(null);
  const [compactionNote, setCompactionNote] = useState<string | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [codePanelOpen, setCodePanelOpen] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gitOpen, setGitOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [platform, setPlatform] = useState("");
  const chatHandle = useRef<{ cancel: () => void } | null>(null);

  const ingest = useCallback((s: AppState) => {
    setProviders(s.providers);
    setPresets(s.presets);
    setActiveProviderId(s.activeProviderId);
    setSettings(s.settings);
    setPlatform(s.platform ?? "");
    setProjects(s.projects ?? []);
    setActiveProjectId(s.activeProjectId ?? null);
    setConversations(s.conversations ?? []);
    setActiveConversationId(s.activeConversationId ?? null);
    setMessages(s.session.messages);
    setTodos(s.session.todos);
    setTools(toolsFromMessages(s.session.messages));
    setLive(null);
    setMeter(s.meter ?? EMPTY_METER);
    setBalance(null); // re-check per provider/conversation
    if (s.settings.accent) applyAccent(s.settings.accent);
    if (s.settings.mode) applyMode(s.settings.mode);
  }, []);

  useEffect(() => {
    api.getState().then((s) => { ingest(s); setReady(true); })
      .catch((e) => { setError(String(e.message || e)); setReady(true); });
  }, [ingest]);

  // Refresh sidebar lists + meter after a turn WITHOUT clobbering the live transcript
  // (messages/tools keep their streamed rich metadata).
  const refreshSidebar = useCallback(async () => {
    try {
      const s = await api.getState();
      setProviders(s.providers);
      setActiveProviderId(s.activeProviderId);
      setProjects(s.projects ?? []);
      setActiveProjectId(s.activeProjectId ?? null);
      setConversations(s.conversations ?? []);
      setActiveConversationId(s.activeConversationId ?? null);
      setMeter(s.meter ?? EMPTY_METER);
    } catch { /* ignore */ }
  }, []);

  const onEvent = useCallback((e: AgentEvent) => {
    switch (e.type) {
      case "session":
        setActiveProviderId(e.provider?.id ?? null);
        break;
      case "assistant_start":
        setLive({ text: "", toolIds: [], providerLabel: e.provider.label });
        break;
      case "usage":
        setLiveUsage((p) => ({ input: Math.max(p?.input ?? 0, e.inputTokens ?? 0), output: Math.max(p?.output ?? 0, e.outputTokens ?? 0) }));
        break;
      case "text":
        setLive((l) => (l ? { ...l, text: l.text + e.delta } : { text: e.delta, toolIds: [] }));
        break;
      case "tool_start":
        setTools((t) => ({ ...t, [e.id]: { id: e.id, name: e.name, title: e.title, input: e.input, status: "running" } }));
        setLive((l) => (l ? { ...l, toolIds: [...l.toolIds, e.id] } : { text: "", toolIds: [e.id] }));
        break;
      case "tool_end":
        setTools((t) => ({
          ...t,
          [e.id]: { ...(t[e.id] ?? { id: e.id, name: "", title: e.id, input: {} }), status: e.ok ? "ok" : "error", resultPreview: e.resultPreview, meta: e.meta },
        }));
        break;
      case "todos":
        setTodos(e.todos);
        break;
      case "awaiting_permission":
        setPendingPermission(e.request);
        break;
      case "permission_resolved":
        setPendingPermission((p) => (p && p.id === e.id ? null : p));
        break;
      case "assistant_committed":
        setMessages((m) => [...m, e.message]);
        setLive(null);
        break;
      case "title":
        setConversations((cs) => cs.map((c) => (c.id === e.conversationId ? { ...c, title: e.title } : c)));
        break;
      case "compacted":
        setCompactionNote(e.note);
        break;
      case "turn_done":
        setLive(null);
        setStreaming(false);
        setLiveUsage(null);
        chatHandle.current = null;
        void refreshSidebar();
        break;
      case "error":
        setError(e.message);
        setLive(null);
        setStreaming(false);
        setLiveUsage(null);
        chatHandle.current = null;
        break;
    }
  }, [refreshSidebar]);

  const send = useCallback((text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: Message = { role: "user", content: [{ type: "text", text }] };
    setMessages((m) => [...m, userMsg]);
    setStreaming(true);
    setCompactionNote(null);
    setError(null);
    setLive({ text: "", toolIds: [] });
    setLiveUsage(null);
    chatHandle.current = api.chat(text, onEvent);
  }, [streaming, onEvent]);

  const checkBalance = useCallback(async () => {
    if (!activeProviderId) return;
    try { setBalance(await api.balance(activeProviderId)); }
    catch (e) { setBalance({ available: false, message: String((e as Error).message || e) }); }
  }, [activeProviderId]);

  const stop = useCallback(() => {
    chatHandle.current?.cancel();
    api.abort();
    setStreaming(false);
    setLive(null);
    chatHandle.current = null;
  }, []);

  const reset = useCallback(() => {
    stop();
    api.resetSession().then(ingest).catch((e) => setError(String(e.message || e)));
    setMessages([]); setTools({}); setTodos([]); setLive(null);
  }, [stop, ingest]);

  const setActive = useCallback(async (id: string) => {
    ingest(await api.setActive(id));
  }, [ingest]);
  const addProvider = useCallback(async (cfg: Partial<ProviderConfig>) => {
    ingest(await api.addProvider(cfg));
  }, [ingest]);
  const deleteProvider = useCallback(async (id: string) => {
    ingest(await api.deleteProvider(id));
  }, [ingest]);
  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    if (patch.accent) applyAccent(patch.accent);
    if (patch.mode) applyMode(patch.mode);
    ingest(await api.updateSettings(patch));
  }, [ingest]);
  const resolvePermission = useCallback((id: string, allowed: boolean) => {
    api.resolvePermission(id, allowed);
    setPendingPermission((p) => (p && p.id === id ? null : p));
  }, []);
  const refresh = useCallback(async () => { ingest(await api.getState()); }, [ingest]);

  const haltStream = useCallback(() => {
    chatHandle.current?.cancel();
    api.abort();
    chatHandle.current = null;
    setStreaming(false);
  }, []);

  const addProject = useCallback(async (p: string, name?: string) => { ingest(await api.addProject(p, name)); }, [ingest]);
  const setActiveProjectAct = useCallback(async (id: string) => { haltStream(); ingest(await api.setActiveProject(id)); }, [ingest, haltStream]);
  const deleteProjectAct = useCallback(async (id: string) => { ingest(await api.deleteProject(id)); }, [ingest]);
  const newConversationAct = useCallback(async () => { haltStream(); ingest(await api.newConversation()); }, [ingest, haltStream]);
  const setActiveConversationAct = useCallback(async (id: string) => { haltStream(); ingest(await api.setActiveConversation(id)); }, [ingest, haltStream]);
  const deleteConversationAct = useCallback(async (id: string) => { ingest(await api.deleteConversation(id)); }, [ingest]);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === activeProviderId) ?? null,
    [providers, activeProviderId],
  );
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const value: FridayStore = {
    ready, error, platform, view, setView, refresh,
    providers, presets, activeProviderId, activeProvider, settings,
    projects, activeProjectId, activeProject, conversations, activeConversationId,
    addProject, setActiveProject: setActiveProjectAct, deleteProject: deleteProjectAct,
    newConversation: newConversationAct, setActiveConversation: setActiveConversationAct, deleteConversation: deleteConversationAct,
    messages, live, tools, todos, streaming, pendingPermission, compactionNote,
    meter, liveUsage, balance, checkBalance,
    codePanelOpen, openFile, settingsOpen, setSettingsOpen, gitOpen, setGitOpen, importOpen, setImportOpen,
    send, stop, reset, setActive, addProvider, deleteProvider, updateSettings, resolvePermission,
    toggleCodePanel: () => setCodePanelOpen((v) => !v),
    setOpenFile: (p) => { setOpenFile(p); if (p) setCodePanelOpen(true); },
    dismissError: () => setError(null),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFriday(): FridayStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFriday must be used within FridayProvider");
  return v;
}
