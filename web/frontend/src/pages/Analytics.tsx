import { useEffect, useState } from "react";
import { BarChart3, FileText, Timer, History, Sparkles, Play, HardDrive } from "lucide-react";
import { store } from "@/lib/store";
import { Panel, Badge, Button, Segmented } from "@/components/ui";
import { getTimeline, runBench, openReport, getBlackbox } from "@/lib/api";
import { cn, fmtTime } from "@/lib/utils";
import type { TimelineEvent, BlackBoxRecord } from "@/lib/types";

/* ============================================================
 * ANALYTICS — the evidence page.
 * Mission event timeline (SQLite-backed) · live anomaly stream
 * (z-score / EWMA) · kernel benchmark comparison across the
 * fleet · one-click printable mission report.
 * ============================================================ */

const KIND_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  fault:    { dot: "bg-crit",   text: "text-crit",   label: "FAULT" },
  recovery: { dot: "bg-ok",     text: "text-ok",     label: "RECOVERY" },
  mode:     { dot: "bg-warn",   text: "text-warn",   label: "MODE" },
  anomaly:  { dot: "bg-info",   text: "text-info",   label: "ANOMALY" },
  log:      { dot: "bg-muted",  text: "text-dim",    label: "LOG" },
};

const BENCH_METRICS = [
  { key: "q",   label: "Queue send→recv", unit: "ns" },
  { key: "mtx", label: "Mutex take/give",  unit: "ns" },
  { key: "ntf", label: "Task notify",      unit: "ns" },
  { key: "cs",  label: "Context switch",   unit: "ns" },
  { key: "mem", label: "malloc/free",      unit: "ns" },
  { key: "jit", label: "Timer jitter",     unit: "µs" },
] as const;

const CRAFT_COLORS = ["#5ac8fa", "#4ade80", "#fbbf24", "#a78bfa"];

export default function Analytics() {
  const swarm     = store.use(s => s.swarm);
  const frames    = store.use(s => s.frames);
  const anomalies = store.use(s => s.anomalies);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [benchBusy, setBenchBusy] = useState(false);

  useEffect(() => {
    const tick = () => getTimeline({ limit: 60 }).then(setTimeline).catch(() => {});
    tick();
    const i = setInterval(tick, 4000);
    return () => clearInterval(i);
  }, []);

  async function benchAll() {
    setBenchBusy(true);
    try { await Promise.all(store.get().swarm.map(c => runBench(c.id))); } catch {}
    setTimeout(() => setBenchBusy(false), 3000);
  }

  /* max per metric across craft for bar normalization */
  const benches = swarm.map(c => frames[c.id]?.bench);
  const hasBench = benches.some(b => b && b.runs > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <BarChart3 className="text-accent" />
        <h1 className="text-xl font-bold tracking-wide">Analytics</h1>
        <span className="text-dim text-sm">Event history · anomaly detection · kernel benchmarks</span>
        <div className="ml-auto flex gap-2">
          <Button tone="primary" onClick={openReport}>
            <FileText size={13} /> Generate mission report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* mission timeline */}
        <Panel title="Mission Timeline" aside={<span className="flex items-center gap-1"><History size={11} /> SQLite event store</span>}>
          <div className="relative max-h-[26rem] overflow-y-auto pr-1">
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
            <div className="space-y-2">
              {timeline.map(ev => {
                const st = KIND_STYLE[ev.kind] ?? KIND_STYLE.log;
                return (
                  <div key={ev.id} className="flex items-start gap-3 relative">
                    <span className={cn("w-[15px] h-[15px] rounded-full border-4 border-bg shrink-0 mt-0.5 z-10", st.dot)} />
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className={cn("font-bold tracking-wider", st.text)}>{st.label}</span>
                        <span className="text-accent">{ev.craft}</span>
                        <span className="text-muted ml-auto shrink-0">{fmtTime(ev.receivedAt)}</span>
                      </div>
                      <div className="text-[11px] text-slate-300 truncate">{ev.message}</div>
                    </div>
                  </div>
                );
              })}
              {!timeline.length && <div className="text-muted text-center py-10 text-sm">No events recorded yet…</div>}
            </div>
          </div>
        </Panel>

        {/* anomaly stream */}
        <Panel title="Anomaly Detection" aside={<span className="flex items-center gap-1"><Sparkles size={11} /> z-score + EWMA · live</span>}>
          <div className="space-y-1.5 max-h-[26rem] overflow-y-auto">
            {anomalies.slice(0, 40).map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 text-[11px] font-mono py-1.5 px-2 rounded-lg border border-border/40 bg-bg/30">
                <Badge tone={a.severity === "high" ? "crit" : a.severity === "medium" ? "warn" : "default"}>
                  {a.severity}
                </Badge>
                <span className="text-accent">{a.craft}</span>
                <span className="text-slate-300">{a.metric}</span>
                <span className="text-dim">= {a.value.toFixed(1)}</span>
                <span className="text-muted ml-auto">z = {a.zscore.toFixed(1)}</span>
                {a.predicted && <span className="text-info text-[9px]">{a.predicted}</span>}
              </div>
            ))}
            {!anomalies.length && (
              <div className="text-muted text-center py-10 text-sm">
                No anomalies yet — inject a fault in Simulate to generate some.
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* benchmarks */}
      <Panel title="Kernel Benchmark Suite"
             aside={<span className="flex items-center gap-1"><Timer size={11} /> microseconds · lower is better</span>}>
        <div className="flex items-center gap-3 mb-4">
          <Button tone="primary" onClick={benchAll} disabled={benchBusy}>
            <Play size={12} /> {benchBusy ? "Benchmarking…" : "Run benchmark on all 4 craft"}
          </Button>
          <div className="flex gap-3 ml-auto">
            {swarm.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1.5 text-[10px] font-mono text-dim">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CRAFT_COLORS[i % 4] }} />
                {c.id}
              </span>
            ))}
          </div>
        </div>

        {!hasBench ? (
          <div className="text-muted text-center py-8 text-sm">
            No benchmark data yet — click "Run benchmark" to measure queue, mutex,
            notification, context-switch, timer-jitter and malloc latency on every craft.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-4">
            {BENCH_METRICS.map(m => {
              const vals = swarm.map(c => (frames[c.id]?.bench as any)?.[m.key] ?? 0);
              const max = Math.max(1, ...vals);
              return (
                <div key={m.key}>
                  <div className="text-[10px] font-mono uppercase tracking-wide text-dim mb-1.5">{m.label}</div>
                  <div className="space-y-1">
                    {swarm.map((c, i) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-muted w-9">{c.id}</span>
                        <div className="flex-1 h-3 bg-border/40 rounded overflow-hidden">
                          <div className="h-full rounded transition-all duration-500"
                               style={{ width: `${(vals[i] / max) * 100}%`, background: CRAFT_COLORS[i % 4] }} />
                        </div>
                        <span className="text-[9px] font-mono text-slate-300 w-14 text-right">
                          {vals[i] ? `${vals[i]} ${m.unit}` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 text-[10px] text-muted font-mono">
          Measured live with QueryPerformanceCounter (sub-µs). Kernel ops are nanoseconds;
          timer jitter is host-scheduler limited (Windows is not a real-time OS).
        </div>
      </Panel>

      {/* flight recorder / black box */}
      <BlackBoxPanel />

      <div className="text-[10px] text-muted font-mono text-center">
        Timeline and anomalies persist in SQLite on the orchestrator · the black box is an
        in-RTOS ring buffer · the mission report aggregates everything into a printable HTML page.
      </div>
    </div>
  );
}

function BlackBoxPanel() {
  const swarm = store.use(s => s.swarm);
  const frames = store.use(s => s.frames);
  const [craft, setCraft] = useState("");
  const [recs, setRecs] = useState<BlackBoxRecord[]>([]);
  const [total, setTotal] = useState(0);
  const focus = craft || swarm[0]?.id || "";

  useEffect(() => {
    if (!focus) return;
    const tick = () => getBlackbox(focus).then(d => {
      setRecs(d.records ?? []); setTotal(d.total ?? 0);
    }).catch(() => {});
    tick();
    const i = setInterval(tick, 2500);
    return () => clearInterval(i);
  }, [focus]);

  const lvlStyle = (l: string) =>
    l === "CRIT" || l === "ERROR" ? "text-crit border-crit/40 bg-crit/10"
    : l === "WARN" ? "text-warn border-warn/40 bg-warn/10"
    : "text-dim border-border";

  return (
    <Panel
      title="Flight Recorder · Black Box"
      aside={<span className="flex items-center gap-1"><HardDrive size={11} /> in-RTOS ring buffer · {total} events</span>}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Segmented
          options={swarm.map(c => {
            const m = frames[c.id]?.mode;
            return { id: c.id, label: c.id,
              tone: (m === "EMERGENCY" || m === "SAFE") ? "crit" as const
                  : m === "WARNING" || m === "DEGRADED" ? "warn" as const : "ok" as const };
          })}
          value={focus} onChange={setCraft} />
        <span className="text-[10px] text-muted font-mono ml-auto">last {recs.length} critical events, newest first</span>
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto font-mono">
        {recs.map((r, i) => (
          <div key={i} className="flex items-center gap-2.5 text-[11px] py-1 px-2 rounded border border-border/30 bg-bg/30">
            <span className="text-muted w-14 text-right">{(r.tick / 1000).toFixed(1)}s</span>
            <span className={cn("px-1.5 py-0.5 rounded border text-[9px]", lvlStyle(r.level))}>{r.level}</span>
            <span className="text-accent w-20 truncate">{r.tag}</span>
            <span className="text-slate-300 truncate">{r.text}</span>
          </div>
        ))}
        {!recs.length && (
          <div className="text-muted text-center py-8 text-sm">
            No events recorded yet — inject a fault in Simulate to fill the black box.
          </div>
        )}
      </div>
    </Panel>
  );
}
