// Remote bridge - turns an inbound text message (from WhatsApp, or the Simulate
// tester) into an agent turn on the active project/conversation, and returns a
// WhatsApp-friendly reply. Transport-agnostic: any transport calls handleInbound.
//
// Safety: locked to the configured phone (digits match), and remote autonomy is
// capped (plan/ask/auto-edit - never full-auto). In "ask"/"auto-edit" a gated
// action sends a YES/NO question and waits for the next inbound message.

import type { AgentEvent } from "../agent/events.ts";
import { runTurn, type PermissionBroker } from "../agent/loop.ts";
import { buildProvider, channelOf } from "../providers/index.ts";
import { loadConfig } from "../config.ts";
import { getActiveProject, getActiveConversation, getConversation, remoteConversation, cwdForConversation, activeCwd } from "../session/store.ts";

export const normalizePhone = (s: string) => (s || "").replace(/[^0-9]/g, "");

export type RemoteSend = (text: string) => void | Promise<void>;

// pending YES/NO permission, keyed by phone (for async transports like WhatsApp)
const pendingPerms = new Map<string, (allowed: boolean) => void>();

export function resolvePendingPermission(identity: string, text: string): boolean {
  const r = pendingPerms.get(identity);
  if (!r) return false;
  const yes = /^\s*(y|yes|ok|okay|allow|sure|go|approve|yep|1|👍)\b/i.test(text.trim());
  r(yes);
  pendingPerms.delete(identity);
  return true;
}

/** WhatsApp authorizes by phone digits matching the configured number. */
export function phoneAuthorized(from: string): boolean {
  const remote = loadConfig().settings.remote;
  return !!remote && normalizePhone(from) === normalizePhone(remote.phone);
}

interface TurnOpts {
  autonomy: "plan" | "ask" | "auto-edit";
  broker: PermissionBroker;
  signal: AbortSignal;
  /** Run against a specific conversation (1 chat = 1 conversation). Falls back to the active one. */
  conversationId?: string;
  /** When set, send a message after each update (per tool action + per assistant turn) instead of one buffered reply. */
  onUpdate?: RemoteSend;
}

/** Run one agent turn for a remote message; either stream updates or return one buffered reply. */
export async function runRemoteTurn(text: string, opts: TurnOpts): Promise<{ reply: string; tools: number; ok: boolean }> {
  const cfg = loadConfig();
  const active = cfg.providers.find((p) => p.id === cfg.activeProviderId);
  let conv = opts.conversationId ? getConversation(opts.conversationId) : null;
  if (!conv) conv = getActiveProject() ? getActiveConversation() : null;
  if (!conv) return { reply: "No project is open in Friday - open one on the PC first.", tools: 0, ok: false };
  if (!active || !active.configured) return { reply: "No model is set up in Friday yet.", tools: 0, ok: false };
  const cwd = cwdForConversation(conv.id) ?? activeCwd(cfg.settings.cwd);

  let buf = "";
  const toolTitles: string[] = [];
  const stream = !!opts.onUpdate;
  const emit = (e: AgentEvent) => {
    if (stream) {
      // One WhatsApp message per update: each tool action, each assistant turn, each error.
      if (e.type === "tool_start") { toolTitles.push(e.title); void opts.onUpdate!(`🔧 ${e.title}`); }
      else if (e.type === "assistant_committed") {
        const t = e.message.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
        if (t) void opts.onUpdate!(t);
      } else if (e.type === "error") void opts.onUpdate!(`⚠️ ${e.message}`);
    } else {
      if (e.type === "text") buf += e.delta;
      else if (e.type === "tool_start") toolTitles.push(e.title);
      else if (e.type === "error") buf += `\n⚠️ ${e.message}`;
    }
  };

  await runTurn({
    userText: text,
    provider: buildProvider(active),
    providerInfo: { id: active.id, label: active.label, kind: active.kind, model: active.model, channel: channelOf(active), supportsEffort: false },
    cwd,
    conversationId: conv.id,
    permissionMode: opts.autonomy,
    effort: cfg.settings.effort,
    broker: opts.broker,
    emit,
    signal: opts.signal,
  });

  if (stream) return { reply: "", tools: toolTitles.length, ok: true };
  const summary = toolTitles.length
    ? `\n\n🔧 ${toolTitles.length} action(s): ${toolTitles.slice(0, 5).join("; ")}${toolTitles.length > 5 ? "…" : ""}`
    : "";
  return { reply: ((buf.trim() || "(done)") + summary).slice(0, 3500), tools: toolTitles.length, ok: true };
}

export interface InboundOptions {
  authorized: boolean;
  /** Bind this chat to its own Friday conversation (1 chat = 1 conversation). Omit to use the active conversation. */
  conversationKey?: string;
  /** Title for an auto-created conversation (e.g. the WhatsApp chat/group name). */
  title?: string;
  /** Stream a message after each update instead of one buffered reply. */
  stream?: boolean;
}

/**
 * Entry point for any transport. `identity` is the sender key (chat id) used for
 * permission Q&A; `opts.authorized` is decided by the transport (phone match /
 * Telegram owner pairing). With `opts.conversationKey` the chat gets its own
 * persistent Friday conversation; with `opts.stream` each update is sent live.
 */
export async function handleInbound(identity: string, text: string, send: RemoteSend, signal: AbortSignal, opts: InboundOptions): Promise<void> {
  const remote = loadConfig().settings.remote;
  if (!remote?.enabled) { await send("Remote is turned off in Friday's settings."); return; }
  if (!opts.authorized) { await send("This Friday is locked to its owner."); return; }

  // A YES/NO reply to a pending permission? Resolve it; the waiting turn sends its result.
  if (resolvePendingPermission(identity, text)) return;

  // Resolve the target conversation (1 chat = 1 conversation) up front so a missing
  // project is reported before we start working.
  let conversationId: string | undefined;
  if (opts.conversationKey) {
    const c = remoteConversation(opts.conversationKey, opts.title);
    if (!c) { await send("No project is open in Friday - open one on the PC first, then message me."); return; }
    conversationId = c.id;
  }

  const broker: PermissionBroker = {
    await: (req) => new Promise<boolean>((resolve) => {
      pendingPerms.set(identity, resolve);
      void send(`🔐 Allow: ${req.title}? - ${req.detail}\nReply YES or NO.`);
    }),
  };
  await send(opts.stream ? "👍 On it…" : "…on it.");
  try {
    const { reply } = await runRemoteTurn(text, {
      autonomy: remote.autonomy, broker, signal, conversationId,
      onUpdate: opts.stream ? send : undefined,
    });
    // In stream mode `reply` is "" on success (already streamed); a non-empty
    // reply means an early-return error we still need to surface.
    if (opts.stream) await send(reply || "✅ Done.");
    else await send(reply);
  } catch (e) {
    await send(`⚠️ ${(e as Error).message}`);
  }
}

/** Simulate (the in-app tester): authorized, gated actions auto-denied so it stays synchronous. */
export async function simulateInbound(text: string, signal: AbortSignal): Promise<{ reply: string; tools: number; ok: boolean }> {
  const broker: PermissionBroker = { await: async () => false };
  return runRemoteTurn(text, { autonomy: loadConfig().settings.remote?.autonomy ?? "ask", broker, signal });
}
