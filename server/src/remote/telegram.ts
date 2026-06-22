// Telegram transport - the recommended free remote channel. Official Bot API,
// no cost, no headless browser, no public tunnel (uses long-polling). You create
// a bot with @BotFather (name it "Friday", set its photo), paste the token, and
// Friday long-polls for your messages and replies. First chat to message it is
// paired as the owner; only the owner is served.

import { loadConfig, saveConfig } from "../config.ts";
import { handleInbound } from "./bridge.ts";

type State = "off" | "starting" | "connected" | "error";
interface Status { state: State; bot?: string; owner?: string; error?: string }

let status: Status = { state: "off" };
let polling = false;
let abort: AbortController | null = null;

export function telegramStatus(): Status {
  const owner = loadConfig().settings.remote?.telegramOwner;
  return { ...status, owner };
}

async function tg(token: string, method: string, body?: unknown, signal?: AbortSignal): Promise<any> {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const j: any = await r.json();
  if (!j.ok) throw new Error(j.description || `telegram ${method} failed`);
  return j.result;
}

async function sendMsg(token: string, chatId: string, text: string) {
  try { await tg(token, "sendMessage", { chat_id: chatId, text: text.slice(0, 4000) }); } catch { /* noop */ }
}

export async function telegramConnect(): Promise<Status> {
  const token = loadConfig().settings.remote?.telegramToken?.trim();
  if (!token) { status = { state: "error", error: "Add your Telegram bot token first (create one with @BotFather)." }; return telegramStatus(); }
  if (polling) return telegramStatus();
  try {
    const me = await tg(token, "getMe");
    status = { state: "connected", bot: me.username };
    polling = true;
    abort = new AbortController();
    void pollLoop(token);
    return telegramStatus();
  } catch (e) {
    status = { state: "error", error: (e as Error).message };
    return telegramStatus();
  }
}

async function pollLoop(token: string) {
  let offset = 0;
  while (polling && !abort?.signal.aborted) {
    try {
      const updates: any[] = await tg(token, "getUpdates", { offset, timeout: 30 }, abort?.signal);
      for (const u of updates) {
        offset = u.update_id + 1;
        const msg = u.message;
        if (!msg?.text) continue;
        const chatId = String(msg.chat.id);
        const text = String(msg.text).trim();

        // owner pairing: first chat to message becomes the owner
        const cfg = loadConfig();
        const rem = cfg.settings.remote;
        if (!rem) continue;
        if (!rem.telegramOwner) {
          rem.telegramOwner = chatId; saveConfig(cfg);
          await sendMsg(token, chatId, "✅ Paired - I'm Friday. Send me a task and I'll work in your active project. (Owner: this chat only.)");
        }
        const authorized = chatId === loadConfig().settings.remote?.telegramOwner;
        if (text === "/start") {
          await sendMsg(token, chatId, authorized ? "Friday here. Send me a task." : "This Friday is already paired to its owner.");
          continue;
        }
        await handleInbound(chatId, text, (t) => sendMsg(token, chatId, t), abort!.signal, {
          authorized, conversationKey: chatId, title: `Telegram · ${msg.chat.title || msg.chat.username || chatId}`, stream: true,
        });
      }
    } catch (e) {
      if (abort?.signal.aborted) break;
      await new Promise((r) => setTimeout(r, 3000)); // backoff on transient errors
    }
  }
}

export function telegramDisconnect(): Status {
  polling = false;
  abort?.abort();
  status = { state: "off" };
  return telegramStatus();
}
