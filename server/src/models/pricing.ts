// Context windows + API pricing per model, and which providers expose a credit
// balance over their API. Prices are $/1M tokens and are best-effort estimates
// (mid-2026) - they move often, so the UI labels cost as an estimate. Local/CLI
// models are free to run.

export interface Price { in: number; out: number } // USD per 1M tokens

const CONTEXT: { re: RegExp; tokens: number }[] = [
  { re: /claude-haiku/, tokens: 200_000 },
  { re: /claude-(opus|sonnet|fable|mythos)/, tokens: 1_000_000 },
  { re: /gpt-5|o[1-9]-/, tokens: 400_000 },
  { re: /gemini-3|gemini-2\.5/, tokens: 1_000_000 },
  { re: /grok-build/, tokens: 256_000 },
  { re: /grok-4|grok-3/, tokens: 1_000_000 },
  { re: /mistral-medium|mistral-large|devstral/, tokens: 256_000 },
  { re: /codestral/, tokens: 32_000 },
  { re: /deepseek-v4|deepseek/, tokens: 1_000_000 },
  { re: /kimi-k2/, tokens: 256_000 },
  { re: /glm-5/, tokens: 1_000_000 },
  { re: /glm-4/, tokens: 200_000 },
  { re: /minimax-m/i, tokens: 1_000_000 },
  { re: /qwen3-coder|qwen3\.6|qwen3/, tokens: 256_000 },
  { re: /qwen2\.5-coder/, tokens: 32_000 },
];

const PRICING: { re: RegExp; price: Price }[] = [
  { re: /claude-fable|claude-mythos/, price: { in: 10, out: 50 } },
  { re: /claude-opus/, price: { in: 5, out: 25 } },
  { re: /claude-sonnet/, price: { in: 3, out: 15 } },
  { re: /claude-haiku/, price: { in: 1, out: 5 } },
  { re: /gpt-5\.5/, price: { in: 5, out: 30 } },
  { re: /gpt-5\.4-mini/, price: { in: 0.75, out: 4.5 } },
  { re: /gpt-5\.4|gpt-5\.3/, price: { in: 2.5, out: 15 } },
  { re: /gpt-5/, price: { in: 5, out: 30 } },
  { re: /gemini-3\.5-flash|gemini-3-flash|gemini-3\.1-flash/, price: { in: 0.3, out: 2.5 } },
  { re: /gemini-3\.1-pro|gemini-3-pro|gemini-2\.5-pro/, price: { in: 2.5, out: 10 } },
  { re: /grok-build/, price: { in: 1.0, out: 2.0 } },
  { re: /grok-4|grok-3/, price: { in: 1.25, out: 2.5 } },
  { re: /mistral-medium/, price: { in: 1.5, out: 7.5 } },
  { re: /mistral-large/, price: { in: 2, out: 6 } },
  { re: /devstral/, price: { in: 0.4, out: 2.0 } },
  { re: /codestral/, price: { in: 0.3, out: 0.9 } },
  { re: /deepseek-v4-flash|deepseek-chat/, price: { in: 0.27, out: 1.1 } },
  { re: /deepseek-v4-pro|deepseek-reasoner|deepseek/, price: { in: 0.55, out: 2.19 } },
  { re: /kimi-k2/, price: { in: 0.6, out: 2.5 } },
  { re: /glm-5/, price: { in: 0.6, out: 2.2 } },
  { re: /glm-4/, price: { in: 0.5, out: 1.5 } },
  { re: /minimax-m/i, price: { in: 0.3, out: 1.65 } },
  { re: /qwen3-coder|qwen3/, price: { in: 1.0, out: 5.0 } },
  { re: /qwen2\.5-coder/, price: { in: 0.3, out: 0.9 } },
];

export function contextWindow(model: string | undefined): number {
  const m = (model || "").toLowerCase();
  return CONTEXT.find((c) => c.re.test(m))?.tokens ?? 128_000;
}

/** Returns $/1M token pricing, or null if unknown / free (local). */
export function priceFor(model: string | undefined): Price | null {
  const m = (model || "").toLowerCase();
  return PRICING.find((p) => p.re.test(m))?.price ?? null;
}

/** Does this provider's API expose a credit balance we can read? */
export function balanceSupport(baseUrl: string | undefined): { supported: boolean; vendor?: string } {
  const u = (baseUrl || "").toLowerCase();
  if (/deepseek\.com/.test(u)) return { supported: true, vendor: "deepseek" };
  return { supported: false };
}
