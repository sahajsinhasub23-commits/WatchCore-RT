import { useEffect, useState } from "react";
import { Activity, Cpu, Database, ShieldCheck, Timer, Radio, Sun, Moon, Zap, BatteryCharging } from "lucide-react";
import { LineChart, Line, Area, AreaChart, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { store } from "@/lib/store";
import { Panel, Segmented, Badge } from "@/components/ui";
import Speedometer from "@/components/Speedometer";
import Radar from "@/components/Radar";
import SchedulerLanes from "@/components/SchedulerLanes";
import { cn, fmtBytes, fmtNum } from "@/lib/utils";
import { modeWords, faultList } from "@/lib/plain";
import { getCorrelation } from "@/lib/api";
import type { Correlation } from "@/lib/types";

/* ============================================================
 * MONITOR — single-craft deep dive.
 * Sensor radar · health/safety rings · live trends ·
 * RTOS scheduler lanes · kernel resources · correlation.
 * ============================================================ */

export default function Monitor() {
  const swarm = store.use(s => s.swarm);
  const logs  = store.use(s => s.logs);
  const [sel, setSel] = useState("");
  const focus = sel || swarm[0]?.id || "";
  const frame  = store.use(s => s.frames[focus]);
  const health = store.use(s => s.health[focus] ?? 0);
  const hist   = store.use(s => s.history[focus]) ?? [];

  const mode = modeWords(frame?.mode ?? "");
  const faults = faultList(frame?.faults ?? 0);

  const trend = hist.slice(-60).map((f, i) => ({
    t: i, cpu: f.cpu, temp: f.sensors.temperature, batt: f.sensors.battery,
    heapKb: Math.round(f.heap / 1024),
  }));

  return (
    <div className="space-y-4">
      {/* header row */}
      <div className="flex items-center gap-4 flex-wrap">
        <Activity className="text-accent" />
        <h1 className="text-xl font-bold tracking-wide">Monitor</h1>
        <Segmented
          options={swarm.map(c => {
            const m = store.get().frames[c.id]?.mode;
            return {
              id: c.id, label: c.id,
              tone: m === "EMERGENCY" || m === "SAFE" ? "crit" as const
                  : m === "WARNING" ? "warn" as const
                  : m === "RECOVERY" ? "info" as const : "ok" as const,
            };
          })}
          value={focus} onChange={setSel} />
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={mode.tone === "ok" ? "ok" : mode.tone === "crit" ? "crit" : mode.tone === "warn" ? "warn" : "info"}>
            {mode.label}
          </Badge>
          {faults.map(f => <Badge key={f} tone="crit">{f}</Badge>)}
        </div>
      </div>

      {/* row 1: rings + radar + trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Vitals" aside={frame ? `tick ${fmtNum(frame.ticks)}` : "offline"}>
          {!frame ? <Empty /> : (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="grid grid-cols-3 gap-1 w-full">
                <Speedometer value={health} label="Health" unit="%"
                  gradient={health > 50 ? ["#60a5fa", "#818cf8", "#34d399"]
                                        : ["#fbbf24", "#fb6f92", "#fb6f92"]}
                  color={health > 80 ? "#34d399" : health > 50 ? "#818cf8" : health > 30 ? "#fbbf24" : "#fb6f92"} />
                <Speedometer value={frame.safety?.score ?? 100} label="Safety" unit="%"
                  gradient={["#a855f7", "#818cf8", "#34d399"]}
                  color={(frame.safety?.score ?? 100) > 70 ? "#34d399" : "#fbbf24"} />
                <Speedometer value={Math.min(100, frame.cpu)} label="CPU Load" unit="%"
                  gradient={["#60a5fa", "#a855f7", "#fb6f92"]}
                  color={frame.cpu > 85 ? "#fb6f92" : frame.cpu > 60 ? "#fbbf24" : "#60a5fa"} />
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 w-full font-mono text-[11px]">
                <KV k="Free heap"     v={fmtBytes(frame.heap)} />
                <KV k="Min ever"      v={fmtBytes(frame.min_heap)} />
                <KV k="Min stack"     v={`${frame.safety?.min_stack ?? "—"} words`} />
                <KV k="Watchdog"      v={`${frame.watchdog.watched} tasks`} />
                <KV k="Power tokens"  v={`${frame.power.free}/${frame.power.total}`}
                    tone={frame.power.free === 0 ? "text-crit" : undefined} />
                <KV k="Recoveries"    v={String(frame.emergency)} />
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Sensor Stress Radar" aside="7 sensors · live">
          <Radar frame={frame} />
        </Panel>

        <Panel title="Live Trends" aside={`${trend.length} samples · 8 Hz`}>
          <ResponsiveContainer width="100%" height={205}>
            <LineChart data={trend}>
              <CartesianGrid stroke="#2f3766" strokeDasharray="2 4" />
              <XAxis dataKey="t" stroke="#727caa" tick={{ fontSize: 9 }} />
              <YAxis stroke="#727caa" tick={{ fontSize: 9 }} width={28} />
              <Tooltip contentStyle={{ background: "#191e3e", border: "1px solid #2f3766", fontSize: 11 }} />
              <Line type="monotone" dataKey="cpu"  stroke="#5ac8fa" dot={false} strokeWidth={1.8} isAnimationActive={false} name="CPU %" />
              <Line type="monotone" dataKey="temp" stroke="#ff7a59" dot={false} strokeWidth={1.8} isAnimationActive={false} name="Temp °C" />
              <Line type="monotone" dataKey="batt" stroke="#4ade80" dot={false} strokeWidth={1.8} isAnimationActive={false} name="Batt %" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 text-[9px] font-mono mt-1 text-dim">
            <span className="flex items-center gap-1"><i className="w-3 h-0.5 bg-accent inline-block" />CPU</span>
            <span className="flex items-center gap-1"><i className="w-3 h-0.5 bg-[#ff7a59] inline-block" />Temp</span>
            <span className="flex items-center gap-1"><i className="w-3 h-0.5 bg-ok inline-block" />Battery</span>
          </div>
        </Panel>
      </div>

      {/* energy & power model */}
      <EnergyPanel craft={focus} />

      {/* row 2: scheduler + kernel resources */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="FreeRTOS Scheduler · Priority Lanes" className="lg:col-span-2"
               aside={frame ? `${frame.tasks.length} tasks · preemptive` : ""}>
          {!frame ? <Empty /> : <SchedulerLanes tasks={frame.tasks} />}
        </Panel>

        <Panel title="Kernel Resources" aside="queues · IPC · buses">
          {!frame ? <Empty /> : (
            <div className="space-y-3.5 font-mono text-[11px]">
              <Meter icon={<Database size={12} />} label="Telemetry queue"
                     used={frame.queue} total={frame.queue + frame.queue_free} unit="slots" />
              <Meter icon={<ShieldCheck size={12} />} label="Power budget"
                     used={frame.power.total - frame.power.free} total={frame.power.total} unit="tokens" />
              <div>
                <div className="flex items-center gap-1.5 text-dim text-[10px] uppercase tracking-wide mb-1.5">
                  <Radio size={12} /> Bus mutexes
                </div>
                <div className="flex gap-2">
                  {(["spi", "i2c", "uart"] as const).map(b => (
                    <span key={b} className={cn(
                      "flex-1 text-center py-1.5 rounded-lg border text-[10px] uppercase transition",
                      frame.mutex[b]
                        ? "border-accent text-accent bg-accent/10 shadow-glow"
                        : "border-border text-muted")}>
                      {b} {frame.mutex[b] ? "● busy" : "○ idle"}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-1 border-t border-border/50">
                <KV k="IPC ops"     v={fmtNum(frame.ipc)} />
                <KV k="Samples"     v={fmtNum(frame.samples)} />
                <KV k="Cmd ok/bad"  v={`${frame.cmd.ok}/${frame.cmd.bad}`} />
                <KV k="Log bytes"   v={fmtNum(frame.logger.bytes)} />
              </div>
              {frame.bench.runs > 0 && (
                <div className="pt-1 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-dim text-[10px] uppercase tracking-wide mb-1">
                    <Timer size={12} /> Kernel latencies (µs)
                  </div>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-[10px]">
                    <KV k="queue"  v={String(frame.bench.q)} />
                    <KV k="mutex"  v={String(frame.bench.mtx)} />
                    <KV k="notify" v={String(frame.bench.ntf)} />
                    <KV k="ctx sw" v={String(frame.bench.cs)} />
                    <KV k="jitter" v={String(frame.bench.jit)} />
                    <KV k="malloc" v={String(frame.bench.mem)} />
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* row 3: correlation + craft activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CorrelationPanel craft={focus} />
        <Panel title={`${focus} · Activity`} aside="this craft only">
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {logs.filter(l => l.craft === focus).slice(0, 40).map((l, i) => {
              const isWarn = l.level === "WARN";
              const isCrit = l.level === "ERROR" || l.level === "CRIT";
              return (
                <div key={i} className="flex items-start gap-2 text-[11px] py-1 border-b border-border/20">
                  <span className="text-muted font-mono text-[9px] mt-0.5 shrink-0 w-10">{(l.ts / 1000).toFixed(0)}s</span>
                  <span className={isCrit ? "text-crit" : isWarn ? "text-warn" : "text-slate-300"}>
                    {l.task.startsWith("Emerg") && l.type === "Start" ? "Started automatic recovery"
                      : l.task.startsWith("Emerg") && l.type === "Complete" ? "Recovery finished"
                      : l.type === "Retained" ? "Saved recovery state history"
                      : l.msg}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* Energy model panel — shows the real power balance: sunlight cycle,
 * solar input, electrical load, and battery charge trend. */
function EnergyPanel({ craft }: { craft: string }) {
  const frame = store.use(s => s.frames[craft]);
  const hist  = store.use(s => s.history[craft]) ?? [];
  if (!frame) return null;

  const sunlit = frame.energy?.sunlit ?? true;
  const load   = frame.energy?.load ?? 0;
  const solar  = frame.sensors.solar;
  const solarW = solar * 5;
  const charging = solarW > load;
  const batt = frame.sensors.battery;

  const data = hist.slice(-60).map((f, i) => ({
    t: i, batt: f.sensors.battery, solar: f.sensors.solar * 5, load: f.energy?.load ?? 0,
  }));

  return (
    <Panel title="Energy & Power Model" aside="real energy balance · solar − load">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-center">
        {/* day/night + balance */}
        <div className="space-y-3">
          <div className={cn("flex items-center gap-2.5 rounded-xl border p-3",
            sunlit ? "border-gold/40 bg-gold/5" : "border-info/30 bg-info/5")}>
            {sunlit
              ? <Sun size={26} className="text-gold animate-[spin_12s_linear_infinite]" />
              : <Moon size={24} className="text-info" />}
            <div>
              <div className={cn("font-bold font-mono text-sm", sunlit ? "text-gold" : "text-info")}>
                {sunlit ? "SUNLIGHT" : "ECLIPSE"}
              </div>
              <div className="text-[10px] text-muted font-mono">
                {sunlit ? "solar panels charging" : "running on battery"}
              </div>
            </div>
          </div>
          <div className={cn("flex items-center gap-2 rounded-lg border p-2 text-[12px] font-mono",
            charging ? "border-ok/40 text-ok" : "border-warn/40 text-warn")}>
            {charging ? <BatteryCharging size={16} /> : <Zap size={16} />}
            {charging ? "Net charging" : "Net draining"}
            <span className="ml-auto">{(solarW - load >= 0 ? "+" : "")}{(solarW - load).toFixed(1)} W</span>
          </div>
        </div>

        {/* numeric readouts */}
        <div className="space-y-2 font-mono text-[12px]">
          <Gaugelet label="Solar input" value={solarW} max={15} unit="W" color="#fcd34d" />
          <Gaugelet label="Load draw" value={load} max={15} unit="W" color="#f59e0b" />
          <Gaugelet label="Battery" value={batt} max={100} unit="%"
                    color={batt < 15 ? "#fb5e7e" : batt < 25 ? "#f59e0b" : "#34d399"} />
        </div>

        {/* battery + power trend chart */}
        <div className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="battFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2f3766" strokeDasharray="2 4" />
              <XAxis dataKey="t" stroke="#727caa" tick={{ fontSize: 9 }} />
              <YAxis stroke="#727caa" tick={{ fontSize: 9 }} width={28} />
              <Tooltip contentStyle={{ background: "#191e3e", border: "1px solid #2f3766", fontSize: 11 }} />
              <Area type="monotone" dataKey="batt" stroke="#34d399" fill="url(#battFill)" strokeWidth={2} isAnimationActive={false} name="Battery %" />
              <Line type="monotone" dataKey="solar" stroke="#fcd34d" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Solar W" />
              <Line type="monotone" dataKey="load" stroke="#f59e0b" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Load W" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 text-[9px] font-mono text-dim">
            <span className="flex items-center gap-1"><i className="w-3 h-0.5 bg-ok inline-block" />Battery</span>
            <span className="flex items-center gap-1"><i className="w-3 h-0.5 bg-gold inline-block" />Solar</span>
            <span className="flex items-center gap-1"><i className="w-3 h-0.5 bg-warn inline-block" />Load</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Gaugelet({ label, value, max, unit, color }:
  { label: string; value: number; max: number; unit: string; color: string }) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-[10px] text-dim mb-0.5">
        <span>{label}</span><span style={{ color }}>{value.toFixed(1)} {unit}</span>
      </div>
      <div className="h-2 bg-border/50 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300"
             style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
    </div>
  );
}

function KV({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className={tone ?? "text-slate-200"}>{v}</span>
    </div>
  );
}

function Meter({ icon, label, used, total, unit }:
  { icon: React.ReactNode; label: string; used: number; total: number; unit: string }) {
  const pct = total ? (used / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-dim text-[10px] uppercase tracking-wide mb-1">
        {icon} {label}
        <span className="ml-auto text-slate-200">{used}/{total} {unit}</span>
      </div>
      <div className="h-2 bg-border/50 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-300",
          pct > 80 ? "bg-crit" : pct > 55 ? "bg-warn" : "bg-accent")}
          style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

function CorrelationPanel({ craft }: { craft: string }) {
  const [data, setData] = useState<Correlation[]>([]);
  useEffect(() => {
    const tick = () => getCorrelation().then(setData).catch(() => {});
    tick();
    const i = setInterval(tick, 3000);
    return () => clearInterval(i);
  }, []);
  const c = data.find(d => d.craft === craft);

  const Bar = ({ label, r }: { label: string; r: number }) => {
    const pct = Math.abs(r) * 100, pos = r >= 0;
    return (
      <div>
        <div className="flex justify-between text-[10px] font-mono text-dim mb-1">
          <span>{label}</span><span className={pos ? "text-ok" : "text-crit"}>r = {r.toFixed(2)}</span>
        </div>
        <div className="h-2 bg-border/50 rounded-full relative overflow-hidden">
          <div className={cn("h-full absolute top-0 transition-all", pos ? "bg-ok left-1/2" : "bg-crit right-1/2")}
               style={{ width: `${pct / 2}%` }} />
          <div className="absolute left-1/2 top-0 h-full w-px bg-muted/60" />
        </div>
      </div>
    );
  };

  return (
    <Panel title="Correlation · CPU / Memory / Battery" aside={c ? `${c.samples} samples · Pearson` : "warming up"}>
      {!c ? <Empty /> : (
        <div className="space-y-3">
          <Bar label="CPU ↔ Battery" r={c.cpu_vs_battery} />
          <Bar label="CPU ↔ Free memory" r={c.cpu_vs_memory} />
          <Bar label="Memory ↔ Battery" r={c.memory_vs_battery} />
          <Bar label="CPU ↔ Task count" r={c.cpu_vs_tasks} />
          <div className="p-2.5 rounded-lg bg-accent/5 border border-accent/30 text-[12px] text-accent">
            💡 {c.insight}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Empty() {
  return <div className="text-muted text-sm py-8 text-center">Waiting for telemetry…</div>;
}
