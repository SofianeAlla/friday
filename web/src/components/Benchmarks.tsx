// Benchmarks - see which coding models lead, across closed-source, open-weight,
// or all. Sort by SWE-bench Verified, SWE-Bench Pro, or LiveBench. Each row shows
// the model's brand logo. Data is a snapshot (see the note) - filter, don't worship.

import { useEffect, useMemo, useState } from "react";
import { useFriday } from "@/store";
import { api, type BenchmarksData, type BenchRow, type ModelType } from "@/lib/api";
import { ModelLogo, type Family } from "@/components/ModelLogo";

type MetricKey = "sweVerified" | "swePro" | "liveBench";
type Filter = "all" | "open" | "closed";

const ctxLabel = (k?: number) => (k ? (k >= 1000 ? `${k / 1000}M` : `${k}K`) : "-");

function TypeBadge({ type }: { type: ModelType }) {
  const open = type === "open";
  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-bespoke-caps ${
        open ? "bg-accent/15 text-accent" : "border border-border bg-secondary text-muted-foreground"
      }`}
    >
      {open ? "Open" : "Closed"}
    </span>
  );
}

export function Benchmarks() {
  const { setView } = useFriday();
  const [data, setData] = useState<BenchmarksData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("sweVerified");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api.getBenchmarks().then(setData).catch((e) => setErr(String(e.message || e)));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const filtered = data.rows.filter((r) => filter === "all" || r.type === filter);
    return [...filtered].sort((a, b) => (Number(b[metric] ?? -1) - Number(a[metric] ?? -1)));
  }, [data, filter, metric]);

  const max = useMemo(() => Math.max(1, ...rows.map((r) => Number(r[metric] ?? 0))), [rows, metric]);

  if (err) return <div className="mx-auto max-w-5xl px-6 py-8"><div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{err}</div></div>;
  if (!data) return <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted-foreground">Loading benchmarks…</div>;

  const SegBtn = <T extends string>({ value, current, set, children }: { value: T; current: T; set: (v: T) => void; children: React.ReactNode }) => (
    <button
      onClick={() => set(value)}
      className={`rounded-sm px-3 py-1.5 text-[11px] font-medium uppercase tracking-bespoke-caps transition-colors ${
        current === value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="font-display text-4xl">Benchmarks</div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Who leads at coding - closed-source, open-weight, or all of them together.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-sm border border-border bg-secondary p-0.5">
          <SegBtn value="all" current={filter} set={setFilter}>All</SegBtn>
          <SegBtn value="open" current={filter} set={setFilter}>Open-weight</SegBtn>
          <SegBtn value="closed" current={filter} set={setFilter}>Closed</SegBtn>
        </div>
        <div className="flex items-center gap-1 rounded-sm border border-border bg-secondary p-0.5">
          {data.metrics.map((m) => (
            <SegBtn key={m.key} value={m.key} current={metric} set={setMetric}>{m.label}</SegBtn>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">{data.metrics.find((m) => m.key === metric)?.hint}</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-left text-[10px] uppercase tracking-bespoke-caps text-muted-foreground">
              <th className="px-3 py-2 font-medium w-10">#</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium hidden sm:table-cell">License</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Context</th>
              <th className="px-3 py-2 font-medium">{data.metrics.find((m) => m.key === metric)?.label}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: BenchRow, i) => {
              const v = Number(r[metric] ?? NaN);
              const has = Number.isFinite(v);
              return (
                <tr key={r.id} className={`border-b border-border last:border-0 ${i === 0 ? "bg-accent/5" : ""}`}>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <ModelLogo family={r.family as Family} size={26} label={r.name} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-foreground">{r.name}</span>
                          <TypeBadge type={r.type} />
                          {r.barnId && (
                            <button onClick={() => setView("barn")} className="text-[10px] uppercase tracking-bespoke-caps text-accent hover:underline">
                              install
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.vendor}{r.params && r.params !== "-" ? ` · ${r.params}` : ""}
                          {r.note ? <span className="hidden lg:inline"> · {r.note}</span> : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-[11px] text-muted-foreground">{r.license}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell tabular-nums text-[11px] text-muted-foreground">{ctxLabel(r.contextK)}</td>
                  <td className="px-3 py-2.5">
                    {has ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-border">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${(v / max) * 100}%` }} />
                        </div>
                        <span className="tabular-nums text-xs text-foreground">{v.toFixed(1)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/80">{data.note}</p>
    </div>
  );
}
