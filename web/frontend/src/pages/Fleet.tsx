import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Orbit, Shield, AlertTriangle, Zap, Layers, ArrowUpRight, Cpu } from "lucide-react";
import { store } from "@/lib/store";
import { Panel, Badge } from "@/components/ui";
import OrbitMap from "@/components/OrbitMap";
import { cn, popcount, healthColor } from "@/lib/utils";
import { modeWords, healthWord, faultList } from "@/lib/plain";

/* ============================================================
 * FLEET — mission overview. Animated orbital constellation in
 * the center; fleet KPIs and the live activity feed alongside.
 * Click a spacecraft (map or card) to inspect it in Monitor.
 * ============================================================ */

function Kpi({ icon, label, value, sub, tone }:
  { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="panel topglow grid-noise p-3 animate-riseIn">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-dim font-mono">
        {icon}{label}
      </div>
      <div className={cn("mt-1.5 text-[26px] font-mono font-bold leading-none", tone)}>{value}</div>
      {sub && <div className="text-[9px] text-muted font-mono mt-1">{sub}</div>}
    </div>
  );
}

export default function Fleet() {
  const swarm  = store.use(s => s.swarm);
  const frames = store.use(s => s.frames);
  const health = store.use(s => s.health);
  const logs   = store.use(s => s.logs);
  const nav = useNavigate();
  const [sel, setSel] = useState("");
  const focus = sel || swarm[0]?.id || "";

  const online = swarm.filter(c => frames[c.id]).length;
  const totalFaults = swarm.reduce((a, c) => a + popcount(frames[c.id]?.faults ?? 0), 0);
  const recoveries  = swarm.reduce((a, c) => a + (frames[c.id]?.emergency ?? 0), 0);
  const totalTasks  = swarm.reduce((a, c) => a + (frames[c.id]?.tasks.length ?? 0), 0);
  const avgHealth   = swarm.length
    ? Math.round(swarm.reduce((a, c) => a + (health[c.id] ?? 0), 0) / swarm.length) : 0;
  const inEmergency = swarm.filter(c => ["EMERGENCY", "SAFE"].includes(frames[c.id]?.mode ?? "")).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Orbit className="text-accent" />
        <h1 className="text-xl font-bold tracking-wide">Fleet Operations</h1>
        <span className="text-dim text-sm">Real-time constellation status</span>
        <Badge tone={inEmergency ? "crit" : "ok"} className="ml-auto">
          {inEmergency ? `${inEmergency} craft in emergency` : "all systems nominal"}
        </Badge>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={<Orbit size={11} className="text-accent" />} label="Online"
             value={`${online}/${swarm.length || 4}`} sub="spacecraft" tone="text-ok" />
        <Kpi icon={<Shield size={11} className="text-accent" />} label="Fleet Health"
             value={avgHealth} sub={healthWord(avgHealth)} tone={healthColor(avgHealth)} />
        <Kpi icon={<AlertTriangle size={11} className="text-accent" />} label="Active Faults"
             value={totalFaults} sub="across fleet" tone={totalFaults ? "text-crit" : "text-ok"} />
        <Kpi icon={<Zap size={11} className="text-accent" />} label="Emergency"
             value={inEmergency} sub="EMERGENCY / SAFE" tone={inEmergency ? "text-crit" : "text-ok"} />
        <Kpi icon={<Layers size={11} className="text-accent" />} label="RTOS Tasks"
             value={totalTasks} sub="running fleet-wide" tone="text-accent" />
        <Kpi icon={<Cpu size={11} className="text-accent" />} label="Recoveries"
             value={recoveries} sub="autonomous, completed" tone="text-info" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* orbital map */}
        <div className="xl:col-span-2 panel topglow hud-corners p-2 animate-fadeIn">
          <OrbitMap selected={focus} onSelect={id => setSel(id)} />
        </div>

        {/* right rail: craft cards */}
        <div className="space-y-3">
          {swarm.map(c => {
            const f = frames[c.id];
            const h = health[c.id] ?? 0;
            const mode = modeWords(f?.mode ?? "");
            const faults = faultList(f?.faults ?? 0);
            const isSel = focus === c.id;
            return (
              <button key={c.id}
                onClick={() => setSel(c.id)}
                onDoubleClick={() => nav("/monitor")}
                className={cn("w-full text-left panel p-3 transition group",
                  isSel ? "border-accent ring-1 ring-accent/40" : "hover:border-accent/50")}>
                <div className="flex items-center gap-2.5">
                  <span className={cn("w-2.5 h-2.5 rounded-full shrink-0",
                    mode.tone === "ok" ? "bg-ok" : mode.tone === "crit" ? "bg-crit animate-pulse2" :
                    mode.tone === "warn" ? "bg-warn" : "bg-info")} />
                  <span className="font-mono font-bold text-[13px]">{c.id}</span>
                  <span className="text-[10px] text-muted font-mono">{c.label} · {c.orbit}</span>
                  <span className={cn("ml-auto text-[10px] font-mono",
                    mode.tone === "ok" ? "text-ok" : mode.tone === "crit" ? "text-crit" :
                    mode.tone === "warn" ? "text-warn" : "text-info")}>{mode.label}</span>
                  <ArrowUpRight size={12} className="text-muted opacity-0 group-hover:opacity-100 transition" />
                </div>
                <div className="mt-2 h-1.5 bg-border/60 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-500",
                    h > 80 ? "bg-ok" : h > 50 ? "bg-accent" : h > 30 ? "bg-warn" : "bg-crit")}
                    style={{ width: `${h}%` }} />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[9px] font-mono text-muted">
                  <span>HP {h}%</span>
                  <span>·</span>
                  <span>{f?.tasks.length ?? 0} tasks</span>
                  <span>·</span>
                  <span>CPU {f?.cpu.toFixed(0) ?? "—"}%</span>
                  {faults.length > 0 && (
                    <span className="text-crit ml-auto">⚠ {faults[0]}{faults.length > 1 ? ` +${faults.length - 1}` : ""}</span>
                  )}
                </div>
              </button>
            );
          })}
          <div className="text-[9px] text-muted font-mono text-center">
            click to focus on map · double-click to open Monitor
          </div>
        </div>
      </div>

      {/* activity feed */}
      <Panel title="Fleet Activity" aside="plain-English · most recent first">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-0.5 max-h-56 overflow-y-auto">
          {logs.slice(0, 40).map((l, i) => {
            const isWarn = l.level === "WARN";
            const isCrit = l.level === "ERROR" || l.level === "CRIT";
            return (
              <div key={i} className="flex items-start gap-2 text-[11px] py-1 border-b border-border/20">
                <span className="text-muted font-mono text-[9px] mt-0.5 shrink-0 w-9">{(l.ts / 1000).toFixed(0)}s</span>
                <span className="text-accent font-mono text-[10px] shrink-0 w-10">{l.craft}</span>
                <span className={cn("truncate", isCrit ? "text-crit" : isWarn ? "text-warn" : "text-slate-300")}>
                  {friendly(l.task, l.type, l.msg)}
                </span>
              </div>
            );
          })}
          {!logs.length && <div className="text-muted text-center py-8 text-sm col-span-2">Waiting for activity…</div>}
        </div>
      </Panel>
    </div>
  );
}

function friendly(task: string, type: string, msg: string): string {
  if (type === "Start" && task.startsWith("Emerg")) return "Started an automatic recovery";
  if (type === "Complete" && task.startsWith("Emerg")) return "Recovery finished";
  if (type === "Retained") return "Saved recovery state history";
  if (type === "RestartTask") return `Watchdog restarting frozen task: ${msg}`;
  if (type === "TaskHang") return `A task stopped responding: ${msg}`;
  if (type === "Escalate") return "Safety manager escalated to SAFE mode";
  if (type === "Status") return `Safety check: ${msg}`;
  if (type === "StackLow") return `Low stack warning: ${msg}`;
  if (type === "StateChange") return "System mode changed";
  if (type === "Startup") return "Spacecraft online";
  return msg;
}
