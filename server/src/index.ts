import express from "express";
import cors from "cors";
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { commandExists } from "./util/proc.ts";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, saveConfig, fromPreset, presetCatalog, type Settings } from "./config.ts";
import { buildProvider, channelOf, supportsEffort, type ProviderConfig } from "./providers/index.ts";
import {
  listProjects, getActiveProject, addProject, setActiveProject, removeProject,
  listConversations, newConversation, setActiveConversation, removeConversation,
  getActiveConversation, getConversation, setConversationTitle, activeCwd, isDir, estimateTokens,
  ensureProject, importConversation,
} from "./session/store.ts";
import { scan as scanImport, importRoots, type ImportSource } from "./import/transcripts.ts";
import { runTurn, type PermissionBroker } from "./agent/loop.ts";
import { generateTitle } from "./agent/titler.ts";
import { simulateInbound } from "./remote/bridge.ts";
import { whatsappConnect, whatsappDisconnect, whatsappStatus } from "./remote/whatsapp.ts";
import { telegramConnect, telegramDisconnect, telegramStatus } from "./remote/telegram.ts";
import type { ActiveProviderInfo, AgentEvent } from "./agent/events.ts";
import { BARN, getBarnModel, type BarnModel } from "./models/catalog.ts";
import { BENCHMARKS } from "./models/benchmarks.ts";
import { contextWindow, priceFor, balanceSupport } from "./models/pricing.ts";
import { ensureRuntime, runtimeEnv, ollamaBin, runtimeStatus, listModels, removeModel } from "./runtime/ollama.ts";
import { ensureCli, cliBinName, cliStatus } from "./runtime/cli.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

// keep the CLI adapter / run_command pointed at the active project's directory
function syncCwdEnv() { process.env.FRIDAY_CWD = activeCwd(loadConfig().settings.cwd); }
syncCwdEnv();

// -------------------------------------------------------------- shared state
let activeAbort: AbortController | null = null;
const pendingPerms = new Map<string, (allowed: boolean) => void>();
const broker: PermissionBroker = {
  await: (req) => new Promise<boolean>((resolve) => pendingPerms.set(req.id, resolve)),
};
function clearPerms(decision = false) {
  for (const [, resolve] of pendingPerms) resolve(decision);
  pendingPerms.clear();
}

function providerInfoFor(cfg: ProviderConfig): ActiveProviderInfo {
  return { id: cfg.id, label: cfg.label, kind: cfg.kind, model: cfg.model, channel: channelOf(cfg), supportsEffort: supportsEffort(cfg) };
}

// Context window + consumption + estimated cost + balance support for the active
// model & conversation. Cost is an estimate (pricing moves); local/CLI is free.
function computeMeter() {
  const cfg = loadConfig();
  const active = cfg.providers.find((p) => p.id === cfg.activeProviderId) ?? null;
  const conv = getActiveProject() ? getActiveConversation() : null;
  const model = active?.model;
  const win = contextWindow(model);
  const usage = conv?.usage ?? { inputTokens: 0, outputTokens: 0, lastInputTokens: 0, turns: 0 };
  const estimated = !usage.lastInputTokens;
  const contextUsed = usage.lastInputTokens || (conv ? estimateTokens(conv.messages) : 0);
  // Billing model: API key (metered) · local Ollama (free) · CLI agent (your plan/subscription, not metered here).
  const isOllama = active?.kind === "cli" && /ollama/i.test(active.command || "");
  const billing: "api" | "local" | "plan" | "cli-key" =
    active?.kind === "cli" ? (isOllama ? "local" : (active.apiKey ? "cli-key" : "plan")) : "api";
  const free = billing === "local";
  const price = billing === "api" && active ? priceFor(model) : null;
  const cost = price ? {
    input: (usage.inputTokens / 1e6) * price.in,
    output: (usage.outputTokens / 1e6) * price.out,
    total: (usage.inputTokens / 1e6) * price.in + (usage.outputTokens / 1e6) * price.out,
    currency: "USD",
  } : null;
  return {
    model: model ?? null,
    providerLabel: active?.label ?? null,
    kind: active?.kind ?? null,
    contextWindow: win,
    contextUsed,
    contextPct: win ? Math.min(100, Math.round((contextUsed / win) * 100)) : 0,
    estimated,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    turns: usage.turns,
    pricing: price,
    cost,
    free,
    billing,
    balanceSupported: balanceSupport(active?.baseUrl).supported,
  };
}

function appState() {
  const cfg = loadConfig();
  const proj = getActiveProject();
  const conv = proj ? getActiveConversation() : null;
  return {
    providers: cfg.providers,
    presets: presetCatalog(),
    activeProviderId: cfg.activeProviderId,
    settings: cfg.settings,
    projects: listProjects(),
    activeProjectId: proj?.id ?? null,
    conversations: proj ? listConversations(proj.id) : [],
    activeConversationId: conv?.id ?? null,
    session: { messages: conv?.messages ?? [], todos: conv?.todos ?? [] },
    meter: computeMeter(),
    platform: process.platform, // "win32" | "linux" | "darwin" - drives OS-aware UI hints
  };
}

app.get("/api/meter", (_req, res) => res.json({ meter: computeMeter() }));

// -------------------------------------------------------------- config routes
app.get("/api/state", (_req, res) => res.json(appState()));

app.post("/api/providers", (req, res) => {
  const cfg = loadConfig();
  const body = req.body || {};
  if (body.id && cfg.providers.some((p) => p.id === body.id)) {
    cfg.providers = cfg.providers.map((p) => (p.id === body.id ? { ...p, ...body } : p));
  } else {
    const created = fromPreset(body.preset || "custom", body);
    cfg.providers.push(created);
    if (!cfg.activeProviderId && created.configured) cfg.activeProviderId = created.id;
  }
  saveConfig(cfg);
  res.json(appState());
});

app.delete("/api/providers/:id", (req, res) => {
  const cfg = loadConfig();
  cfg.providers = cfg.providers.filter((p) => p.id !== req.params.id);
  if (cfg.activeProviderId === req.params.id) {
    cfg.activeProviderId = cfg.providers.find((p) => p.configured)?.id ?? null;
  }
  saveConfig(cfg);
  res.json(appState());
});

app.post("/api/providers/active", (req, res) => {
  const cfg = loadConfig();
  const { id } = req.body || {};
  if (cfg.providers.some((p) => p.id === id)) cfg.activeProviderId = id;
  saveConfig(cfg);
  res.json(appState());
});

// Lightweight connectivity check for a provider (backend concern; the UI just
// surfaces a quiet ✓/✗). API kinds make a 1-token ping; CLI kinds check the
// executable resolves.
async function readErrSafe(r: Response): Promise<string> {
  const t = await r.text().catch(() => "");
  try { const j = JSON.parse(t); return j?.error?.message || j?.message || t || `HTTP ${r.status}`; }
  catch { return t || `HTTP ${r.status}`; }
}
app.post("/api/providers/:id/test", async (req, res) => {
  const p = loadConfig().providers.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ ok: false, message: "Unknown provider" });
  try {
    if (p.kind === "cli") {
      // Locale/space-safe: resolve the binary, don't run a shell string.
      const first = ((p.command || "").trim().split(/\s+/)[0] ?? "").replace(/^["']|["']$/g, "");
      if (!first) return res.json({ ok: false, message: "No command configured" });
      const ok = /[\\/]/.test(first) ? existsSync(first) : commandExists(first);
      return res.json(ok ? { ok: true, message: `${path.basename(first)} is available` } : { ok: false, message: `'${first}' isn't installed or on PATH` });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let url: string, headers: Record<string, string>, body: unknown;
    if (p.kind === "anthropic") {
      url = "https://api.anthropic.com/v1/messages";
      headers = { "content-type": "application/json", "x-api-key": p.apiKey || "", "anthropic-version": "2023-06-01" };
      body = { model: p.model || "claude-opus-4-8", max_tokens: 1, messages: [{ role: "user", content: "ping" }] };
    } else {
      const base = (p.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      url = `${base}/chat/completions`;
      headers = { "content-type": "application/json", authorization: `Bearer ${p.apiKey || ""}` };
      body = { model: p.model || "gpt-5.5", max_tokens: 1, messages: [{ role: "user", content: "ping" }] };
    }
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) return res.json({ ok: true, status: r.status, message: "Connected" });
    return res.json({ ok: false, status: r.status, message: await readErrSafe(r) });
  } catch (e) {
    return res.json({ ok: false, message: (e as Error).message });
  }
});

// Credit balance - only some providers expose it over their API (DeepSeek does).
app.get("/api/providers/:id/balance", async (req, res) => {
  const p = loadConfig().providers.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ available: false, message: "Unknown provider" });
  const bal = balanceSupport(p.baseUrl);
  if (!bal.supported) {
    return res.json({ available: false, message: "This provider's API doesn't expose a credit balance - check it on the provider's dashboard." });
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    if (bal.vendor === "deepseek") {
      const host = (p.baseUrl || "https://api.deepseek.com").replace(/\/$/, "").replace(/\/v1$/, "");
      const r = await fetch(`${host}/user/balance`, { headers: { authorization: `Bearer ${p.apiKey || ""}` }, signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) return res.json({ available: false, message: `Balance check failed: ${await readErrSafe(r)}` });
      const j: any = await r.json();
      const info = j?.balance_infos?.[0];
      return res.json({
        available: true,
        balance: info?.total_balance != null ? Number(info.total_balance) : null,
        currency: info?.currency ?? "USD",
        topUp: info?.topped_up_balance != null ? Number(info.topped_up_balance) : undefined,
        granted: info?.granted_balance != null ? Number(info.granted_balance) : undefined,
        accountAvailable: j?.is_available,
      });
    }
    clearTimeout(timer);
    return res.json({ available: false });
  } catch (e) {
    return res.json({ available: false, message: (e as Error).message });
  }
});

// CLI agent install status + managed install (claude / codex / gemini).
app.get("/api/providers/:id/cli-status", (req, res) => {
  const p = loadConfig().providers.find((x) => x.id === req.params.id);
  if (!p || p.kind !== "cli") return res.json({ applicable: false });
  res.json({ applicable: true, ...cliStatus(p.command) });
});

app.post("/api/providers/:id/install-cli", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const emit = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const cfg = loadConfig();
  const p = cfg.providers.find((x) => x.id === req.params.id);
  if (!p || p.kind !== "cli") { emit({ type: "error", message: "Not a CLI provider." }); return res.end(); }
  const binName = cliBinName(p.command);
  const r = await ensureCli(binName, (line) => emit({ type: "log", line }));
  if (!r.ok || !r.bin) { emit({ type: "error", message: r.message || "Install failed." }); return res.end(); }
  // Point the provider command at the managed binary so it runs without PATH setup.
  if (r.source === "managed") {
    const rest = (p.command || "").trim().split(/\s+/).slice(1).join(" ");
    p.command = `"${r.bin}" ${rest}`.trim();
    saveConfig(cfg);
  }
  emit({ type: "status", message: r.source === "system" ? `${binName} is already installed.` : `${binName} installed.` });
  emit({ type: "done", ok: true, authHint: r.authHint });
  res.end();
});

app.post("/api/settings", (req, res) => {
  const cfg = loadConfig();
  const patch = (req.body || {}) as Partial<Settings>;
  if (patch.cwd && !existsSync(patch.cwd)) {
    return res.status(400).json({ error: `Path does not exist: ${patch.cwd}` });
  }
  cfg.settings = { ...cfg.settings, ...patch };
  saveConfig(cfg);
  syncCwdEnv();
  res.json(appState());
});

// -------------------------------------------------------------- projects (repos)
app.post("/api/projects/add", (req, res) => {
  const p = String(req.body?.path ?? "").trim();
  if (!p) return res.status(400).json({ error: "Provide a folder path." });
  if (!isDir(p)) return res.status(400).json({ error: `Not a folder: ${p}` });
  addProject(p, req.body?.name);
  syncCwdEnv();
  res.json(appState());
});
app.post("/api/projects/active", (req, res) => {
  activeAbort?.abort(); clearPerms(false);
  setActiveProject(String(req.body?.id ?? ""));
  syncCwdEnv();
  res.json(appState());
});
app.delete("/api/projects/:id", (req, res) => {
  removeProject(req.params.id);
  syncCwdEnv();
  res.json(appState());
});

// -------------------------------------------------------------- conversations (per project)
app.post("/api/conversations/new", (_req, res) => {
  const proj = getActiveProject();
  if (!proj) return res.status(400).json({ error: "Add a project first." });
  activeAbort?.abort(); clearPerms(false);
  newConversation(proj.id);
  res.json(appState());
});
app.post("/api/conversations/active", (req, res) => {
  const proj = getActiveProject();
  if (!proj) return res.status(400).json({ error: "Add a project first." });
  activeAbort?.abort(); clearPerms(false);
  setActiveConversation(proj.id, String(req.body?.id ?? ""));
  res.json(appState());
});
app.delete("/api/conversations/:id", (req, res) => {
  removeConversation(req.params.id);
  res.json(appState());
});

// "New chat" - a fresh conversation in the active project.
app.post("/api/session/reset", (_req, res) => {
  activeAbort?.abort();
  clearPerms(false);
  const proj = getActiveProject();
  if (proj) newConversation(proj.id);
  res.json(appState());
});

// -------------------------------------------------------------- remote (WhatsApp)
const DEFAULT_REMOTE = { enabled: false, phone: "", autonomy: "ask" as const, channel: "telegram" as const };
const remoteState = () => ({
  settings: loadConfig().settings.remote ?? DEFAULT_REMOTE,
  telegram: telegramStatus(),
  whatsapp: whatsappStatus(),
});
app.get("/api/remote", (_req, res) => res.json(remoteState()));
app.post("/api/remote", (req, res) => {
  const cfg = loadConfig();
  cfg.settings.remote = { ...(cfg.settings.remote ?? DEFAULT_REMOTE), ...(req.body || {}) };
  saveConfig(cfg);
  res.json(remoteState());
});
// WhatsApp (experimental)
app.get("/api/remote/status", (_req, res) => res.json(whatsappStatus()));
app.post("/api/remote/connect", (req, res) => {
  const phone = typeof req.body?.phone === "string" && req.body.phone.trim() ? req.body.phone.trim() : undefined;
  void whatsappConnect(phone ? { phone } : {});
  res.json(whatsappStatus());
});
app.post("/api/remote/disconnect", async (_req, res) => { await whatsappDisconnect(); res.json(whatsappStatus()); });
// Telegram (recommended)
app.get("/api/remote/telegram/status", (_req, res) => res.json(telegramStatus()));
app.post("/api/remote/telegram/connect", async (_req, res) => res.json(await telegramConnect()));
app.post("/api/remote/telegram/disconnect", (_req, res) => res.json(telegramDisconnect()));
app.post("/api/remote/simulate", async (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) return res.json({ reply: "(type something to simulate)", tools: 0, ok: false });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120000);
  try { res.json(await simulateInbound(text, ctrl.signal)); }
  catch (e) { res.json({ reply: `Error: ${(e as Error).message}`, tools: 0, ok: false }); }
  finally { clearTimeout(t); }
});

// -------------------------------------------------------------- permissions
app.post("/api/permission", (req, res) => {
  const { id, allowed } = req.body || {};
  const resolve = pendingPerms.get(id);
  if (resolve) { resolve(!!allowed); pendingPerms.delete(id); }
  res.json({ ok: true });
});

app.post("/api/chat/abort", (_req, res) => {
  activeAbort?.abort();
  clearPerms(false);
  res.json({ ok: true });
});

// -------------------------------------------------------------- chat (SSE)
app.post("/api/chat", async (req, res) => {
  const cfg = loadConfig();
  const text = String(req.body?.text ?? "").trim();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const emit = (e: AgentEvent) => { res.write(`data: ${JSON.stringify(e)}\n\n`); };

  const active = cfg.providers.find((p) => p.id === cfg.activeProviderId);
  const proj = getActiveProject();
  const conv = proj ? getActiveConversation() : null;
  const cwd = activeCwd(cfg.settings.cwd);
  emit({
    type: "session",
    sessionId: conv?.id ?? "",
    cwd,
    provider: active ? providerInfoFor(active) : null,
    permissionMode: cfg.settings.permissionMode,
    conversationId: conv?.id ?? null,
  });

  if (!text) { emit({ type: "error", message: "Empty message." }); return res.end(); }
  if (!proj || !conv) { emit({ type: "error", message: "Add a repo/folder first (＋ in the left sidebar) so Friday has a project to work in." }); return res.end(); }
  if (!active) { emit({ type: "error", message: "No model selected. Add one in Settings → Models." }); return res.end(); }
  if (!active.configured) { emit({ type: "error", message: `${active.label} isn't configured yet (missing API key or command).` }); return res.end(); }

  // one turn at a time
  activeAbort?.abort();
  clearPerms(false);
  const ctrl = new AbortController();
  activeAbort = ctrl;
  // Detect a real client disconnect via the RESPONSE stream. (Using req.on("close")
  // is wrong here: express.json() fully drains the request body before this handler
  // runs, so req emits "close" immediately and would abort the turn instantly.)
  res.on("close", () => { ctrl.abort(); });

  const heartbeat = setInterval(() => emit({ type: "ping" }), 15000);
  try {
    // Local model? Make sure Friday's managed runtime is up before the turn.
    if (active.kind === "cli" && /ollama/i.test(active.command || "")) {
      const rt = await ensureRuntime(() => {});
      if (!rt.ok) { emit({ type: "error", message: rt.message || "Local runtime unavailable." }); return; }
    }
    const firstTurn = (conv.messages?.length ?? 0) === 0;
    const provider = buildProvider(active);
    await runTurn({
      userText: text,
      provider,
      providerInfo: providerInfoFor(active),
      cwd,
      conversationId: conv.id,
      permissionMode: cfg.settings.permissionMode,
      effort: cfg.settings.effort,
      broker,
      emit,
      signal: ctrl.signal,
    });

    // Auto-title the first turn (like Claude Code). Use the active API model, or
    // any configured API provider as a utility model; CLI-only setups keep the
    // first-message-derived title.
    if (firstTurn && !ctrl.signal.aborted) {
      const titler = active.kind !== "cli" ? active : cfg.providers.find((p) => p.configured && p.kind !== "cli");
      if (titler) {
        try {
          const t = await generateTitle(buildProvider(titler), text, ctrl.signal);
          if (t) { setConversationTitle(conv.id, t); emit({ type: "title", conversationId: conv.id, title: t }); }
        } catch { /* keep derived title */ }
      }
    }
  } catch (e) {
    emit({ type: "error", message: (e as Error).message });
  } finally {
    clearInterval(heartbeat);
    clearPerms(false);
    if (activeAbort === ctrl) activeAbort = null;
    res.end();
  }
});

// -------------------------------------------------------------- The Barn + Benchmarks
app.get("/api/barn", (_req, res) => res.json({ models: BARN }));
app.get("/api/benchmarks", (_req, res) => res.json(BENCHMARKS));
app.get("/api/runtime/status", async (_req, res) => res.json(await runtimeStatus()));
app.get("/api/runtime/models", async (_req, res) => res.json(await listModels()));
app.post("/api/runtime/models/remove", async (req, res) => {
  await removeModel(String(req.body?.tag ?? ""));
  res.json(await listModels());
});
// Use an already-pulled local model (register the provider + activate, no pull).
app.post("/api/barn/use", async (req, res) => {
  const m = getBarnModel(String(req.body?.id ?? ""));
  if (!m || m.install !== "ollama") return res.status(400).json({ error: "Not a local model." });
  await ensureRuntime(() => {});
  registerBarnProvider(m);
  res.json(appState());
});

/** Register an installed Barn model as a usable provider; activate if it's ready. */
function registerBarnProvider(m: BarnModel): { id: string; configured: boolean; channel: "api" | "cli" | "local" } {
  const cfg = loadConfig();
  // Reuse an existing provider for this Barn model instead of creating duplicates.
  const existing = cfg.providers.find((p) => p.preset === `barn:${m.id}`);
  if (existing) {
    cfg.activeProviderId = existing.id;
    saveConfig(cfg);
    syncCwdEnv();
    return { id: existing.id, configured: !!existing.configured, channel: channelOf(existing) };
  }
  const id = `barn-${m.id}-${Math.random().toString(36).slice(2, 6)}`;
  const provider: ProviderConfig =
    m.install === "ollama"
      ? { id, kind: "cli", label: m.name, command: `"${ollamaBin() ?? "ollama"}" run ${m.ollamaTag}`, preset: `barn:${m.id}`, model: m.ollamaTag, enabled: true }
      : { id, kind: m.kind ?? "openai", label: m.name, baseUrl: m.kind === "anthropic" ? undefined : m.api!.baseUrl, model: m.api!.model, preset: `barn:${m.id}`, enabled: true };
  cfg.providers.push(provider);
  saveConfig(cfg); // recomputes `configured`
  const saved = loadConfig().providers.find((p) => p.id === id)!;
  if (saved.configured) {
    const c2 = loadConfig();
    c2.activeProviderId = id;
    saveConfig(c2);
    syncCwdEnv();
  }
  return { id, configured: !!saved.configured, channel: channelOf(saved) };
}

app.post("/api/barn/install", async (req, res) => {
  const m = getBarnModel(String(req.body?.id ?? ""));
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const emit = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  if (!m) { emit({ type: "error", message: "Unknown model." }); return res.end(); }

  // API-served open models: register the provider; the user adds a key in Settings.
  if (m.install === "api") {
    const { id, configured, channel } = registerBarnProvider(m);
    emit({ type: "status", message: `Added ${m.name}. ${configured ? "Ready to use." : "Add your API key in Settings to start."}` });
    emit({ type: "done", ok: true, providerId: id, needsKey: !configured, channel });
    return res.end();
  }

  // Local models: ensure Friday's managed runtime (downloads it on first use - no
  // separate Ollama install), then pull the model into Friday's own model store.
  const rt = await ensureRuntime((line) => emit({ type: "log", line }));
  if (!rt.ok || !rt.bin) {
    emit({ type: "error", message: rt.message || "Could not start the local runtime." });
    return res.end();
  }
  emit({ type: "status", message: `Runtime ready (${rt.source}). Pulling ${m.ollamaTag}…` });
  const child = spawn(rt.bin, ["pull", m.ollamaTag!], { env: runtimeEnv() });
  let stderrBuf = "";
  let spawnFailed = false;
  const relay = (d: unknown) =>
    String(d).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => emit({ type: "log", line }));
  child.stdout?.on("data", relay);
  child.stderr?.on("data", (d) => { stderrBuf += String(d); relay(d); });
  child.on("error", (err) => {
    spawnFailed = true;
    emit({ type: "error", message: `Could not start Ollama (${err.message}). Install it from https://ollama.com and ensure it's on your PATH.` });
    res.end();
  });
  res.on("close", () => { try { child.kill(); } catch { /* noop */ } });
  child.on("close", (code) => {
    if (spawnFailed) return;
    if (code !== 0) {
      const s = stderrBuf.toLowerCase();
      const tail = stderrBuf.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "").trim().split(/\r?\n/).filter(Boolean).slice(-3).join(" · ").slice(0, 300);
      let hint: string;
      if (/not recognized|command not found|no such file|is not recognized|n'est pas reconnu|introuvable|nicht erkannt|no se reconoce|non riconosciuto/.test(s)) {
        hint = "Ollama isn't installed (or not on PATH). Install it from https://ollama.com, then click Install again.";
      } else if (/connection refused|could not connect|dial tcp|actively refused|connectex|connect: /.test(s)) {
        hint = "Ollama is installed but its service isn't running. Start the Ollama app (or run `ollama serve` in a terminal), then click Install again.";
      } else if (/manifest|does not exist|no such model|not found|file does not exist/.test(s)) {
        hint = `Model tag "${m.ollamaTag}" wasn't found by your Ollama. Update Ollama to the latest version, or try a different tag in Settings.`;
      } else {
        hint = `ollama pull exited ${code}.`;
      }
      emit({ type: "error", message: tail ? `${hint}  -  ${tail}` : hint });
      return res.end();
    }
    const { id, channel } = registerBarnProvider(m);
    emit({ type: "status", message: `${m.name} is installed and selected.` });
    emit({ type: "done", ok: true, providerId: id, needsKey: false, channel });
    res.end();
  });
});

// -------------------------------------------------------------- filesystem (dig deeper)
app.get("/api/fs/tree", async (req, res) => {
  const root = path.resolve(activeCwd(loadConfig().settings.cwd));
  const rel = String(req.query.path ?? "");
  const dir = rel ? path.resolve(root, rel) : root;
  const relToRoot = path.relative(root, dir);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) return res.status(400).json({ error: "Out of bounds" });
  try {
    const names = await fs.readdir(dir, { withFileTypes: true });
    const entries = names
      .filter((d) => d.name !== "node_modules" && d.name !== ".git")
      .map((d) => ({
        name: d.name,
        type: d.isDirectory() ? ("dir" as const) : ("file" as const),
        path: path.relative(root, path.join(dir, d.name)).split(path.sep).join("/"),
      }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    res.json({ root, entries });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

app.get("/api/fs/file", async (req, res) => {
  const root = path.resolve(activeCwd(loadConfig().settings.cwd));
  const rel = String(req.query.path ?? "");
  const abs = path.resolve(root, rel);
  const relToRoot = path.relative(root, abs);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) return res.status(400).json({ error: "Out of bounds" });
  try {
    const st = statSync(abs);
    if (st.size > 2_000_000) return res.json({ path: rel, content: "(file too large to preview)", language: "text", truncated: true });
    const content = await fs.readFile(abs, "utf8");
    const ext = rel.split(".").pop()?.toLowerCase() || "";
    res.json({ path: rel, content, language: ext, truncated: false });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

// Native folder picker (runs on the user's machine, so we can pop the real OS dialog).
function pickFolder(): Promise<{ path?: string; cancelled?: boolean; error?: string }> {
  return new Promise((resolve) => {
    let cmd: string, args: string[];
    if (process.platform === "win32") {
      // The modern Explorer-style folder picker (IFileOpenDialog in folder mode),
      // not the old skinny "Browse For Folder" tree. Compiled on the fly via
      // Add-Type and handed to powershell as a base64 -EncodedCommand so no
      // amount of quotes/backslashes in the script can break the argv.
      const winScript = `
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class FridayFolder {
  [ComImport, ClassInterface(ClassInterfaceType.None), Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
  private class FileOpenDialogRCW { }
  [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileDialog {
    [PreserveSig] int Show([In] IntPtr parent);
    void SetFileTypes(uint n, IntPtr p);
    void SetFileTypeIndex(uint i);
    void GetFileTypeIndex(out uint i);
    void Advise(IntPtr e, out uint c);
    void Unadvise(uint c);
    void SetOptions(uint o);
    void GetOptions(out uint o);
    void SetDefaultFolder(IShellItem i);
    void SetFolder(IShellItem i);
    void GetFolder(out IShellItem i);
    void GetCurrentSelection(out IShellItem i);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string n);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string n);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string t);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string t);
    void GetResult(out IShellItem i);
    void AddPlace(IShellItem i, int p);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string e);
    void Close(int hr);
    void SetClientGuid(ref Guid g);
    void ClearClientData();
    void SetFilter(IntPtr f);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr bc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdn, out IntPtr name);
    void GetAttributes(uint mask, out uint attr);
    void Compare(IShellItem psi, uint hint, out int order);
  }
  public static string Pick(string title) {
    var d = (IFileDialog)(new FileOpenDialogRCW());
    uint o; d.GetOptions(out o);
    d.SetOptions(o | 0x20 | 0x40); // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
    if (!string.IsNullOrEmpty(title)) d.SetTitle(title);
    int hr = d.Show(IntPtr.Zero);
    if (hr != 0) return "";
    IShellItem item; d.GetResult(out item);
    IntPtr p; item.GetDisplayName(0x80058000u, out p);
    string s = Marshal.PtrToStringUni(p);
    Marshal.FreeCoTaskMem(p);
    return s;
  }
}
"@
$r = [FridayFolder]::Pick("Select a project folder")
if ($r) { Write-Output $r }
`;
      cmd = "powershell";
      args = ["-NoProfile", "-STA", "-EncodedCommand", Buffer.from(winScript, "utf16le").toString("base64")];
    } else if (process.platform === "darwin") {
      cmd = "osascript";
      args = ["-e", 'POSIX path of (choose folder with prompt "Select a project folder")'];
    } else {
      cmd = "sh";
      args = ["-c", `zenity --file-selection --directory --title="Select a project folder" 2>/dev/null || kdialog --getexistingdirectory "$HOME" 2>/dev/null`];
    }
    let out = "";
    const child = spawn(cmd, args, { env: process.env });
    child.stdout?.on("data", (d) => { out += d; });
    child.on("error", (e) => resolve({ error: e.message }));
    child.on("close", () => {
      const p = out.trim().split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop();
      resolve(p ? { path: p } : { cancelled: true });
    });
  });
}
app.post("/api/fs/pick", async (_req, res) => res.json(await pickFolder()));

// -------------------------------------------- import from Claude Code / Codex
const isSource = (s: unknown): s is ImportSource | "all" => s === "claude" || s === "codex" || s === "all";

// Discover importable sessions on this machine WITHOUT importing them.
app.get("/api/import/scan", (req, res) => {
  const source = isSource(req.query.source) ? req.query.source : "all";
  try {
    const sessions = scanImport(source).map((s) => ({
      sourceId: s.sourceId, source: s.source, title: s.title,
      projectPath: s.cwd, projectName: path.basename(s.cwd) || s.cwd,
      messageCount: s.messageCount, createdAt: s.createdAt, updatedAt: s.updatedAt,
    }));
    res.json({ sessions, roots: importRoots() });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message || e) });
  }
});

// Import selected sessions (or all of a source) as projects + conversations.
app.post("/api/import", (req, res) => {
  const source = isSource(req.body?.source) ? req.body.source : "all";
  const ids: string[] | undefined = Array.isArray(req.body?.sessionIds) ? req.body.sessionIds.map(String) : undefined;
  try {
    let sessions = scanImport(source);
    if (ids && ids.length) {
      const want = new Set(ids);
      sessions = sessions.filter((s) => want.has(s.sourceId));
    }
    // Import oldest-first so the per-project active conversation ends up newest.
    sessions.sort((a, b) => a.updatedAt - b.updatedAt);
    let imported = 0, skipped = 0;
    let firstProjectId: string | null = null;
    const projectIds = new Set<string>();
    for (const s of sessions) {
      const proj = ensureProject(s.cwd);
      projectIds.add(proj.id);
      if (!firstProjectId) firstProjectId = proj.id;
      const r = importConversation(proj.id, {
        title: s.title, messages: s.messages,
        createdAt: s.createdAt, updatedAt: s.updatedAt,
        providerLabel: s.source === "claude" ? "Claude Code (imported)" : "Codex (imported)",
        sourceId: s.sourceId,
      });
      if (r.skipped) skipped++; else imported++;
    }
    if (firstProjectId) setActiveProject(firstProjectId);
    res.json({ imported, skipped, projects: projectIds.size });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message || e) });
  }
});

// -------------------------------------------------------------- git / GitHub
function git(args: string[], cwd: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, env: process.env });
    let out = "", err = "";
    child.stdout?.on("data", (d) => { out += d; });
    child.stderr?.on("data", (d) => { err += d; });
    child.on("error", (e) => resolve({ code: -1, out: "", err: e.message }));
    child.on("close", (code) => resolve({ code: code ?? 0, out: out.trim(), err: err.trim() }));
  });
}

app.get("/api/git/status", async (_req, res) => {
  const proj = getActiveProject();
  if (!proj) return res.json({ isRepo: false, message: "No project open." });
  const cwd = proj.path;
  if (!commandExists("git")) return res.json({ isRepo: false, gitMissing: true, message: "Git isn't installed. Get it from https://git-scm.com." });
  const inside = await git(["rev-parse", "--is-inside-work-tree"], cwd);
  if (inside.code !== 0 || inside.out !== "true") return res.json({ isRepo: false });
  const branch = (await git(["branch", "--show-current"], cwd)).out;
  const remote = (await git(["remote", "get-url", "origin"], cwd)).out || null;
  const porcelain = (await git(["status", "--porcelain"], cwd)).out;
  const dirty = porcelain ? porcelain.split(/\r?\n/).filter(Boolean).length : 0;
  let ahead = 0, behind = 0;
  const lr = await git(["rev-list", "--left-right", "--count", "@{u}...HEAD"], cwd);
  if (lr.code === 0) { const [b, a] = lr.out.split(/\s+/).map(Number); behind = b || 0; ahead = a || 0; }
  res.json({ isRepo: true, branch, remote, dirty, ahead, behind });
});

app.post("/api/git/init", async (_req, res) => {
  const proj = getActiveProject();
  if (!proj) return res.json({ ok: false, message: "No project open." });
  const r = await git(["init"], proj.path);
  res.json({ ok: r.code === 0, output: r.out || r.err });
});

app.post("/api/git/connect", async (req, res) => {
  const proj = getActiveProject();
  if (!proj) return res.json({ ok: false, message: "No project open." });
  const url = String(req.body?.url ?? "").trim();
  if (!url) return res.json({ ok: false, message: "Provide a remote URL." });
  await git(["remote", "remove", "origin"], proj.path); // ignore if absent
  const r = await git(["remote", "add", "origin", url], proj.path);
  res.json({ ok: r.code === 0, output: r.out || r.err });
});

app.post("/api/git/commit-push", async (req, res) => {
  const proj = getActiveProject();
  if (!proj) return res.json({ ok: false, message: "No project open." });
  const cwd = proj.path;
  const message = String(req.body?.message ?? "").trim() || "Update from Friday";
  const log: string[] = [];
  const run = async (a: string[]) => { const r = await git(a, cwd); log.push(`$ git ${a.join(" ")}\n${r.out || r.err}`.trim()); return r; };
  await run(["add", "-A"]);
  const commit = await run(["commit", "-m", message]);
  if (commit.code !== 0 && /nothing to commit/i.test(commit.out + commit.err)) {
    return res.json({ ok: true, output: "Nothing to commit (working tree clean)." });
  }
  const remote = (await git(["remote", "get-url", "origin"], cwd)).out;
  if (remote) {
    const branch = (await git(["branch", "--show-current"], cwd)).out || "main";
    let push = await run(["push", "origin", branch]);
    if (push.code !== 0) push = await run(["push", "-u", "origin", branch]); // first push
    return res.json({ ok: push.code === 0, output: log.join("\n\n") });
  }
  res.json({ ok: commit.code === 0, output: log.join("\n\n") + "\n\n(No remote set - committed locally. Connect a GitHub remote to push.)" });
});

// -------------------------------------------------------------- static (prod)
const webDist = process.env.FRIDAY_WEB_DIST || path.resolve(__dirname, "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`\n  » Friday backend on http://localhost:${PORT}`);
  console.log(`     active project: ${getActiveProject()?.path ?? "(none - add a repo in the app)"}\n`);
});
