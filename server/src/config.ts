import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { ProviderConfig } from "./providers/types.ts";
import { PRESETS, getPreset } from "./providers/catalog.ts";
import { FRIDAY_DIR } from "./util/proc.ts";

// Autonomy levels (least → most autonomous), à la Claude Code:
//   plan      - read-only; never writes or runs (plan first)
//   ask       - confirm every edit and command
//   auto-edit - auto-apply file edits, still confirm shell commands
//   auto      - full autonomy; no prompts
export type PermissionMode = "plan" | "ask" | "auto-edit" | "auto";

export type Effort = "default" | "low" | "medium" | "high" | "max";

// Remote control over WhatsApp. Locked to one phone; remote autonomy is capped
// (never full-auto) for safety since a text can trigger real actions on the PC.
export interface RemoteSettings {
  enabled: boolean;
  phone: string; // WhatsApp number (any format; matched on digits)
  autonomy: "plan" | "ask" | "auto-edit";
  channel?: "telegram" | "whatsapp";
  telegramToken?: string;
  telegramOwner?: string; // chat id paired on first message
}

export interface Settings {
  cwd: string;
  permissionMode: PermissionMode;
  /** Reasoning effort, applied only when the active model API supports it. */
  effort?: Effort;
  accent?: { h: number; s: number; l: number };
  mode?: "dark" | "light";
  remote?: RemoteSettings;
}

export interface PersistedConfig {
  providers: ProviderConfig[];
  activeProviderId: string | null;
  settings: Settings;
}

const CONFIG_DIR = FRIDAY_DIR;
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function defaultCwd(): string {
  const w = process.env.FRIDAY_WORKDIR?.trim();
  if (w && existsSync(w)) return path.resolve(w);
  return homedir();
}

function isConfigured(c: ProviderConfig): boolean {
  if (c.kind === "cli") return !!c.command?.trim();
  if (c.kind === "anthropic") return !!c.apiKey?.trim();
  return !!c.apiKey?.trim() && !!c.baseUrl?.trim(); // openai-compatible
}

function markConfigured(providers: ProviderConfig[]): ProviderConfig[] {
  return providers.map((p) => ({ ...p, configured: isConfigured(p) }));
}

/** Build a provider config from a catalog preset + user-supplied fields. */
export function fromPreset(presetId: string, fields: Partial<ProviderConfig>): ProviderConfig {
  const pre = getPreset(presetId);
  const id = fields.id || `${presetId}-${Math.random().toString(36).slice(2, 8)}`;
  const cfg: ProviderConfig = {
    id,
    kind: fields.kind || pre?.kind || "openai",
    label: fields.label || pre?.label || presetId,
    model: fields.model ?? pre?.defaultModel,
    apiKey: fields.apiKey,
    baseUrl: fields.baseUrl ?? pre?.defaultBaseUrl,
    command: fields.command ?? pre?.defaultCommand,
    preset: presetId,
    enabled: fields.enabled ?? true,
  };
  cfg.configured = isConfigured(cfg);
  return cfg;
}

/** Seed providers from environment keys present on first launch. */
function seedFromEnv(): ProviderConfig[] {
  const out: ProviderConfig[] = [];
  const add = (presetId: string, apiKey?: string) => {
    if (!apiKey) return;
    out.push(fromPreset(presetId, { apiKey }));
  };
  add("claude", process.env.ANTHROPIC_API_KEY);
  add("openai", process.env.OPENAI_API_KEY);
  add("mistral", process.env.MISTRAL_API_KEY);
  add("gemini", process.env.GEMINI_API_KEY);
  add("qwen", process.env.DASHSCOPE_API_KEY);
  return out;
}

let cache: PersistedConfig | null = null;

export function loadConfig(): PersistedConfig {
  if (cache) return cache;
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as PersistedConfig;
      raw.providers = markConfigured(raw.providers ?? []);
      if (!raw.settings) raw.settings = { cwd: defaultCwd(), permissionMode: "auto" };
      if (!raw.settings.cwd) raw.settings.cwd = defaultCwd();
      cache = raw;
      return raw;
    } catch {
      // fall through to fresh seed
    }
  }
  const seeded = markConfigured(seedFromEnv());
  cache = {
    providers: seeded,
    activeProviderId: seeded.find((p) => p.configured)?.id ?? null,
    settings: { cwd: defaultCwd(), permissionMode: "auto" },
  };
  saveConfig(cache);
  return cache;
}

export function saveConfig(cfg: PersistedConfig): void {
  cfg.providers = markConfigured(cfg.providers);
  cache = cfg;
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

export function presetCatalog() {
  return PRESETS;
}
