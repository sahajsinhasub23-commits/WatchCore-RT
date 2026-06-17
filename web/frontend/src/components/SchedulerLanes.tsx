import { cn } from "@/lib/utils";
import type { TaskSnapshot } from "@/lib/types";

/* ============================================================
 * SchedulerLanes — live FreeRTOS priority-lane view.
 * One horizontal lane per priority level (6 high → 0 idle);
 * every task appears as a chip in its lane, colored by state.
 * RUNNING tasks glow; FROZEN tasks pulse amber. This is a real
 * visualization of the preemptive scheduler — recovery tasks
 * visibly appear in lane 5 during emergencies, then vanish.
 * ============================================================ */

const LANES = [
  { prio: 6, label: "P6", role: "Highest / Timer Svc" },
  { prio: 5, label: "P5", role: "Emergency recovery" },
  { prio: 4, label: "P4", role: "Watchdog / Safety" },
  { prio: 3, label: "P3", role: "Events / Commands" },
  { prio: 2, label: "P2", role: "Control / Telemetry" },
  { prio: 1, label: "P1", role: "Monitors" },
  { prio: 0, label: "P0", role: "Idle" },
];

function chipStyle(state: string): string {
  switch (state) {
    case "RUNNING":   return "border-ok text-ok bg-ok/15 shadow-glowOk";
    case "READY":     return "border-accent/70 text-accent bg-accent/10";
    case "SUSPENDED": return "border-warn text-warn bg-warn/10 animate-pulse2";
    case "DELETED":   return "border-crit text-crit bg-crit/10";
    default:          return "border-border text-dim bg-bg/40";          /* BLOCKED */
  }
}

export default function SchedulerLanes({ tasks }: { tasks: TaskSnapshot[] }) {
  return (
    <div className="space-y-1">
      {LANES.map(lane => {
        const inLane = tasks.filter(t => t.prio === lane.prio);
        const hasEmergency = lane.prio >= 5 && inLane.length > 0 &&
          inLane.some(t => /Rec$/.test(t.name));
        return (
          <div key={lane.prio}
               className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 transition",
                 hasEmergency ? "border-crit/40 bg-crit/5" : "border-border/50 bg-bg/30")}>
            <div className="w-24 shrink-0">
              <div className={cn("text-[11px] font-mono font-bold",
                lane.prio >= 5 ? "text-crit" : lane.prio >= 3 ? "text-accent" : "text-dim")}>
                {lane.label}
              </div>
              <div className="text-[8px] text-muted font-mono leading-tight">{lane.role}</div>
            </div>
            <div className="flex-1 flex flex-wrap gap-1.5 min-h-[26px] items-center">
              {inLane.length === 0 && (
                <span className="text-[9px] text-muted/50 font-mono">— empty —</span>
              )}
              {inLane.map(t => (
                <span key={t.name}
                  className={cn(
                    "px-2 py-0.5 rounded-md border text-[10px] font-mono tracking-wide transition",
                    chipStyle(t.state))}
                  title={`${t.name} · ${t.state} · stack ${t.stack}w · runtime ${t.runtime}`}>
                  {t.state === "RUNNING" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-ok mr-1 animate-pulse2" />}
                  {t.name}
                </span>
              ))}
            </div>
            <div className="text-[9px] font-mono text-muted w-7 text-right shrink-0">
              {inLane.length || ""}
            </div>
          </div>
        );
      })}
      <div className="flex gap-4 pt-1 text-[9px] font-mono text-muted">
        <span><span className="text-ok">●</span> running</span>
        <span><span className="text-accent">●</span> ready</span>
        <span><span className="text-dim">●</span> waiting</span>
        <span><span className="text-warn">●</span> frozen</span>
        <span className="ml-auto">higher lane preempts lower — watch P5 during a fault</span>
      </div>
    </div>
  );
}
