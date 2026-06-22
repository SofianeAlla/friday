// WhatsApp transport via whatsapp-web.js - installed & managed by Friday (no
// manual setup). You scan a QR once to link; then Friday texts you about the
// active conversation and runs your replies through the bridge.
//
// NOTE: This drives a headless browser (puppeteer/Chromium) and links your
// WhatsApp via the unofficial web protocol. It's isolated and fails gracefully:
// any error surfaces in status and never affects the rest of the app.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { handleInbound, normalizePhone } from "./bridge.ts";
import { loadConfig } from "../config.ts";
import { FRIDAY_DIR } from "../util/proc.ts";

const WA_DIR = path.join(FRIDAY_DIR, "runtime", "wa");
const MODULES = path.join(WA_DIR, "node_modules");

type State = "off" | "installing" | "starting" | "qr" | "code" | "connected" | "error";
interface Status { state: State; qr?: string; code?: string; error?: string; me?: string }

let status: Status = { state: "off" };
let client: any = null;
let abort: AbortController | null = null;
const sentIds = new Set<string>(); // ids Friday itself sent, to avoid reply loops

export function whatsappStatus(): Status { return status; }

/**
 * Decide whether an inbound WhatsApp message should drive Friday. Pure + exported
 * so it can be unit-tested. Two link topologies are supported safely:
 *  - Own number linked: only the "message yourself" chat counts (fromMe in the
 *    self-chat). We never act on the owner's messages in their other chats.
 *  - Dedicated Friday number linked: the owner is a separate participant, so we
 *    act on any chat (incl. groups) where the message author is the owner.
 */
export function authorizeWhatsApp(p: { fromMe: boolean; chatId: string; selfId: string; authorDigits: string; ownerPhone: string }): boolean {
  if (p.fromMe) return !!p.chatId && p.chatId === p.selfId;
  return !!p.ownerPhone && normalizePhone(p.authorDigits) === normalizePhone(p.ownerPhone);
}

function npmInstall(onLog: (s: string) => void): Promise<boolean> {
  return new Promise((resolve) => {
    mkdirSync(WA_DIR, { recursive: true });
    const pkg = path.join(WA_DIR, "package.json");
    if (!existsSync(pkg)) writeFileSync(pkg, JSON.stringify({ name: "friday-wa", private: true, version: "1.0.0" }), "utf8");
    onLog("Installing the WhatsApp engine (one-time; downloads a headless browser, can take a few minutes)…");
    const child = spawn("npm", ["install", "whatsapp-web.js", "qrcode", "--prefix", WA_DIR, "--no-fund", "--no-audit"], { shell: true, env: process.env });
    child.stdout?.on("data", (d) => onLog(String(d).trim()));
    child.stderr?.on("data", (d) => onLog(String(d).trim()));
    child.on("error", () => resolve(false));
    child.on("close", (c) => resolve(c === 0));
  });
}

async function importManaged(pkgMain: string): Promise<any> {
  const url = pathToFileURL(path.join(MODULES, pkgMain)).href;
  return import(url);
}

export async function whatsappConnect(opts: { phone?: string } = {}, onLog: (s: string) => void = () => {}): Promise<Status> {
  if (status.state === "connected" || status.state === "starting" || status.state === "installing") return status;
  try {
    if (!existsSync(path.join(MODULES, "whatsapp-web.js"))) {
      status = { state: "installing" };
      const ok = await npmInstall(onLog);
      if (!ok) { status = { state: "error", error: "Could not install the WhatsApp engine (npm failed)." }; return status; }
    }
    status = { state: "starting" };
    const wweb: any = await importManaged("whatsapp-web.js/index.js").then((m) => m.default ?? m);
    const qrcode: any = await importManaged("qrcode/lib/index.js").then((m) => m.default ?? m).catch(() => null);
    const { Client, LocalAuth } = wweb;

    // When a phone number is supplied we link by pairing code ("type your
    // number" UX) instead of QR: WhatsApp shows an 8-char code to enter once.
    const linkPhone = normalizePhone(opts.phone || "");
    let pairingRequested = false;

    abort = new AbortController();
    client = new Client({
      authStrategy: new LocalAuth({ dataPath: path.join(WA_DIR, "session") }),
      puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
    });

    // Serialize outbound sends so streamed updates land in order.
    let sendChain: Promise<void> = Promise.resolve();
    const send = (to: string, text: string): Promise<void> => {
      sendChain = sendChain.then(async () => {
        const m = await client.sendMessage(to, String(text).slice(0, 4000));
        if (m?.id?._serialized) sentIds.add(m.id._serialized);
      }).catch(() => { /* a failed send must not break the chain */ });
      return sendChain;
    };

    client.on("qr", async (qr: string) => {
      // Phone-code linking: request once when the socket is ready (qr fired).
      if (linkPhone && !pairingRequested) {
        pairingRequested = true;
        try {
          if (typeof client.requestPairingCode !== "function") throw new Error("This WhatsApp engine build doesn't support phone-code linking - use the QR instead.");
          const code: string = await client.requestPairingCode(linkPhone);
          status = { state: "code", code };
        } catch (e) {
          status = { state: "error", error: (e as Error).message || "Could not request a pairing code - check the number is in full international format." };
        }
        return;
      }
      const dataUrl = qrcode ? await qrcode.toDataURL(qr).catch(() => undefined) : undefined;
      status = { state: "qr", qr: dataUrl ?? qr };
    });
    client.on("ready", async () => {
      const selfId: string = client?.info?.wid?._serialized ?? "";
      status = { state: "connected", me: client?.info?.wid?.user };
      // Greet in the "Message yourself" chat so a thread appears immediately.
      try { if (selfId) await send(selfId, "👋 Friday is linked. Message me here - or add this number to a WhatsApp group - and I'll work in your active project and post updates as I go. Each chat is its own conversation."); } catch { /* noop */ }
    });
    client.on("auth_failure", (m: string) => { status = { state: "error", error: `Auth failed: ${m}` }; });
    client.on("disconnected", () => { status = { state: "off" }; });

    // `message` fires for inbound messages (incl. the owner in a group when a
    // dedicated number is linked); `message_create` also fires for self-chat
    // (fromMe) and for our own sends (skipped via sentIds). One handler, deduped.
    const seen = new Set<string>();
    const onMessage = async (msg: any) => {
      try {
        const selfId: string = client?.info?.wid?._serialized ?? "";
        if (!selfId) return;
        const id: string | undefined = msg?.id?._serialized;
        if (id && (sentIds.has(id) || seen.has(id))) return;
        if (id) seen.add(id);
        const body = String(msg.body ?? "").trim();
        if (!body) return;
        const chatId = String(msg.from || "");
        const authorDigits = String(msg.author || msg.from || "").replace(/@.*$/, "");
        const ownerPhone = loadConfig().settings.remote?.phone || "";
        if (!authorizeWhatsApp({ fromMe: !!msg.fromMe, chatId, selfId, authorDigits, ownerPhone })) return;
        let title = "WhatsApp";
        try { const chat = await msg.getChat(); if (chat?.name) title = chat.isGroup ? `WhatsApp · ${chat.name}` : chat.name; } catch { /* keep default */ }
        await handleInbound(chatId, body, (t) => send(chatId, t), abort!.signal, { authorized: true, conversationKey: chatId, title, stream: true });
      } catch { /* never crash the listener */ }
    };
    client.on("message", onMessage);
    client.on("message_create", onMessage);

    await client.initialize();
    return status;
  } catch (e) {
    status = { state: "error", error: (e as Error).message };
    return status;
  }
}

export async function whatsappDisconnect(): Promise<void> {
  try { abort?.abort(); await client?.destroy?.(); } catch { /* noop */ }
  client = null;
  status = { state: "off" };
}
