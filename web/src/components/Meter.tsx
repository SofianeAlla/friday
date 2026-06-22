// Context + cost meter, shown just above the composer (Claude Code-style): how
// full the model's context window is, the running API-cost estimate for this
// conversation, and - where the provider's API exposes it - the credit balance.

import { useFriday } from "@/store";

const fmtTok = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`
  : n >= 1000 ? `${Math.round(n / 1000)}K`
  : String(n);

function fmtUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function Meter() {
  const { meter, liveUsage, balance, checkBalance, activeProvider, streaming } = useFriday();
  if (!activeProvider) return null;

  const pct = meter.contextPct;
  const bar = pct >= 90 ? "bg-red-400" : pct >= 75 ? "bg-amber-400" : "bg-accent";
  const liveOut = streaming && liveUsage ? liveUsage.output : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-1.5 text-[11px] text-muted-foreground">
      {/* context window usage */}
      <div className="flex items-center gap-2" title={`${meter.contextUsed.toLocaleString()} / ${meter.contextWindow.toLocaleString()} tokens${meter.estimated ? " (estimated from transcript)" : ""}`}>
        <span className="uppercase tracking-bespoke-caps text-[10px]">Context</span>
        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
          <span className={`block h-full rounded-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
        </span>
        <span className="tabular-nums">
          {meter.estimated ? "~" : ""}{fmtTok(meter.contextUsed)} / {fmtTok(meter.contextWindow)} · {pct}%
        </span>
      </div>

      {/* cost / billing */}
      <div className="flex items-center gap-1.5" title={
        meter.billing === "plan"
          ? `${meter.providerLabel ?? "This CLI"} runs on its own login/subscription. Friday doesn't meter it.`
          : meter.billing === "cli-key"
            ? `${meter.providerLabel ?? "This CLI"} is using your API key - the provider bills you per token. Friday can't read the CLI's token counts, so it isn't metered here.`
            : meter.billing === "local"
              ? "Runs locally on your machine - no API cost."
              : meter.pricing
                ? `${fmtTok(meter.inputTokens)} in · ${fmtTok(meter.outputTokens)} out\n@ $${meter.pricing.in}/$${meter.pricing.out} per 1M tokens (estimate)`
                : `${fmtTok(meter.inputTokens)} in · ${fmtTok(meter.outputTokens)} out`
      }>
        <span className="uppercase tracking-bespoke-caps text-[10px]">{meter.billing === "api" ? "Cost" : "Billing"}</span>
        {meter.billing === "local" ? (
          <span className="text-foreground">Local · free</span>
        ) : meter.billing === "plan" ? (
          <span className="text-foreground">Your plan / subscription <span className="text-muted-foreground/70">· not metered here</span></span>
        ) : meter.billing === "cli-key" ? (
          <span className="text-foreground">Your API key <span className="text-muted-foreground/70">· billed by provider · not metered here</span></span>
        ) : meter.cost ? (
          <span className="tabular-nums text-foreground">{fmtUsd(meter.cost.total)} <span className="text-muted-foreground/70">est.</span></span>
        ) : (
          <span className="tabular-nums">{fmtTok(meter.inputTokens)}↑ {fmtTok(meter.outputTokens)}↓</span>
        )}
        {meter.billing === "api" && liveOut > 0 && <span className="tabular-nums text-accent">· +{fmtTok(liveOut)} out</span>}
      </div>

      {/* credit balance (only where the API exposes it) */}
      {meter.balanceSupported && (
        <div className="flex items-center gap-1.5">
          <span className="uppercase tracking-bespoke-caps text-[10px]">Balance</span>
          {balance == null ? (
            <button onClick={() => void checkBalance()} className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-bespoke-caps hover:border-accent hover:text-foreground">
              Check
            </button>
          ) : balance.available ? (
            <span className="tabular-nums text-foreground">
              {balance.balance != null ? `${balance.currency === "USD" ? "$" : ""}${balance.balance}${balance.currency && balance.currency !== "USD" ? " " + balance.currency : ""}` : "-"}
              <button onClick={() => void checkBalance()} className="ml-1.5 text-muted-foreground/70 hover:text-accent" title="Refresh">↻</button>
            </span>
          ) : (
            <span className="text-muted-foreground/70" title={balance.message}>n/a</span>
          )}
        </div>
      )}
    </div>
  );
}
