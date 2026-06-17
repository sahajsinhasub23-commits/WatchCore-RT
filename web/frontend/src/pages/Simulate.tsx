import { useRef, useState } from "react";
import {
  FlaskConical, Flame, BatteryLow, Radiation, Snowflake, Sun, Compass, Gauge,
  MemoryStick, Antenna, CheckCircle2, RotateCw, Play, Square, ChevronRight,
} from "lucide-react";
import { store } from "@/lib/store";
import { Panel, Badge, Button } from "@/components/ui";
import { setFault, controlTask, restartCraft } from "@/lib/api";
import { cn, fmtTime } from "@/lib/utils";
import { modeWords, faultList } from "@/lib/plain";

/* ============================================================
 * SIMULATE — mission scenario console.
 * Top: scripted multi-craft scenarios (the demo showpiece) with
 * a live step tracker. Below: single-fault manual injection.
 * ============================================================ */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Step { label: string; run: (crafts: string[]) => Promise<void>; waitMs: number }
interface Scenario {
  id: string; name: string; blurb: string; icon: React.ReactNode; tone: "crit" | "warn" | "info";
  steps: Step[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "thermal-cascade",
    name: "Thermal Cascade",
    blurb: "Overheats all 4 spacecraft one after another. Watch staggered recovery tasks spawn fleet-wide.",
    icon: <Flame size={20} />, tone: "crit",
    steps: [
      { label: "Overheat SC-01", waitMs: 1100, run: async c => { await setFault(c[0], "temp"); } },
      { label: "Overheat SC-02", waitMs: 1100, run: async c => { await setFault(c[1], "temp"); } },
      { label: "Overheat SC-03", waitMs: 1100, run: async c => { await setFault(c[2], "temp"); } },
      { label: "Overheat SC-04", waitMs: 1300, run: async c => { await setFault(c[3], "temp"); } },
      { label: "Observe autonomous recovery", waitMs: 2200, run: async () => {} },
    ],
  },
  {
    id: "comms-blackout",
    name: "Comms Blackout",
    blurb: "Kills the downlink on the whole fleet at once. CommWatch detects the loss; CommRec re-acquires.",
    icon: <Antenna size={20} />, tone: "warn",
    steps: [
      { label: "Drop downlink on all craft", waitMs: 1600,
        run: async c => { await Promise.all(c.map(id => setFault(id, "comm"))); } },
      { label: "CommWatch detecting loss", waitMs: 1800, run: async () => {} },
      { label: "Observe link re-acquisition", waitMs: 2200, run: async () => {} },
    ],
  },
  {
    id: "watchdog-drill",
    name: "Watchdog Drill",
    blurb: "Freezes the CPU monitor on SC-01. After ~7 s of silence the watchdog kills and restarts it.",
    icon: <Snowflake size={20} />, tone: "info",
    steps: [
      { label: "Freeze CpuMon on SC-01", waitMs: 1500,
        run: async c => { await controlTask(c[0], "CpuMon", "suspend"); } },
      { label: "Task silent — heartbeats missed", waitMs: 6500, run: async () => {} },
      { label: "Watchdog kick-and-restart fires", waitMs: 2500, run: async () => {} },
    ],
  },
  {
    id: "stress-test",
    name: "Multi-Fault Stress Test",
    blurb: "Hits SC-02 with 3 faults at once. The SafetyManager sees the overload and escalates to SAFE mode.",
    icon: <Gauge size={20} />, tone: "crit",
    steps: [
      { label: "Inject high temperature on SC-02", waitMs: 500, run: async c => { await setFault(c[1], "temp"); } },
      { label: "Inject low battery on SC-02", waitMs: 500, run: async c => { await setFault(c[1], "battery"); } },
      { label: "Inject radiation spike on SC-02", waitMs: 1500, run: async c => { await setFault(c[1], "radiation"); } },
      { label: "SafetyManager escalates → SAFE", waitMs: 2200, run: async () => {} },
      { label: "Clear faults, return to normal", waitMs: 1800,
        run: async c => {
          for (const k of ["temp", "battery", "radiation"]) await setFault(c[1], k, "clear");
        } },
    ],
  },
];

const MANUAL = [
  { key: "temp",      label: "Overheat",       icon: <Flame size={15} />,      tone: "crit" as const },
  { key: "battery",   label: "Drain Battery",  icon: <BatteryLow size={15} />, tone: "warn" as const },
  { key: "radiation", label: "Radiation",      icon: <Radiation size={15} />,  tone: "warn" as const },
  { key: "solar",     label: "Solar Loss",     icon: <Sun size={15} />,        tone: "warn" as const },
  { key: "attitude",  label: "Tumbling",       icon: <Compass size={15} />,    tone: "warn" as const },
  { key: "pressure",  label: "Pressure",       icon: <Gauge size={15} />,      tone: "warn" as const },
  { key: "memory",    label: "Low Memory",     icon: <MemoryStick size={15} />,tone: "crit" as const },
  { key: "comm",      label: "Lose Comms",     icon: <Antenna size={15} />,    tone: "crit" as const },
];

type StepState = "pending" | "active" | "done";

export default function Simulate() {
  const swarm = store.use(s => s.swarm);
  const logs  = store.use(s => s.logs);
  const [craft, setCraft] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [stepStates, setStepStates] = useState<StepState[]>([]);
  const [feed, setFeed] = useState<{ t: number; text: string }[]>([]);
  const cancelRef = useRef(false);

  const target = craft || swarm[1]?.id || swarm[0]?.id || "";
  const frame = store.use(s => s.frames[target]);
  const mode = modeWords(frame?.mode ?? "");
  const faults = faultList(frame?.faults ?? 0);

  function note(text: string) {
    setFeed(f => [{ t: Date.now(), text }, ...f].slice(0, 30));
  }

  async function runScenario(sc: Scenario) {
    if (running) return;
    const ids = store.get().swarm.map(c => c.id);
    if (ids.length < 4) { note("Need 4 spacecraft online."); return; }
    cancelRef.current = false;
    setRunning(sc.id);
    setStepStates(sc.steps.map(() => "pending"));
    note(`▶ Scenario started: ${sc.name}`);

    for (let i = 0; i < sc.steps.length; i++) {
      if (cancelRef.current) break;
      setStepStates(st => st.map((s, j) => j === i ? "active" : s));
      try { await sc.steps[i].run(ids); } catch { /* craft may be restarting */ }
      note(sc.steps[i].label);
      await sleep(sc.steps[i].waitMs);
      setStepStates(st => st.map((s, j) => j === i ? "done" : s));
    }

    note(cancelRef.current ? `■ Scenario aborted: ${sc.name}` : `✓ Scenario complete: ${sc.name}`);
    setRunning(null);
  }

  function abort() { cancelRef.current = true; }

  async function clearAll() {
    note(`Clearing every fault on all spacecraft…`);
    const ids = store.get().swarm.map(c => c.id);
    await Promise.all(ids.flatMap(id =>
      ["temp", "battery", "radiation", "memory", "comm", "hang", "queue", "deadlock", "solar", "attitude", "pressure"]
        .map(k => setFault(id, k, "clear"))));
    note("All faults cleared fleet-wide.");
  }

  const activeScenario = SCENARIOS.find(s => s.id === running);
  const craftLogs = logs.filter(l => l.craft === target).slice(0, 25);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <FlaskConical className="text-accent" />
        <h1 className="text-xl font-bold tracking-wide">Simulate</h1>
        <span className="text-dim text-sm">Run a mission scenario, watch the fleet heal itself</span>
        <div className="ml-auto flex gap-2">
          <Button tone="ok" onClick={clearAll}><CheckCircle2 size={13} /> Clear all faults</Button>
        </div>
      </div>

      {/* scripted scenarios */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {SCENARIOS.map(sc => {
          const isRunning = running === sc.id;
          const toneBorder = sc.tone === "crit" ? "border-crit/40 hover:border-crit"
                           : sc.tone === "warn" ? "border-warn/40 hover:border-warn"
                           : "border-info/40 hover:border-info";
          const toneText = sc.tone === "crit" ? "text-crit" : sc.tone === "warn" ? "text-warn" : "text-info";
          return (
            <div key={sc.id}
              className={cn("panel p-4 transition flex flex-col gap-2.5",
                isRunning ? "border-accent ring-1 ring-accent/40 shadow-glow" : toneBorder)}>
              <div className={cn("flex items-center gap-2 font-bold", toneText)}>
                {sc.icon}{sc.name}
                {isRunning && <span className="ml-auto text-[9px] font-mono text-accent animate-pulse2">RUNNING</span>}
              </div>
              <div className="text-[11px] text-dim leading-snug flex-1">{sc.blurb}</div>
              <button
                onClick={() => isRunning ? abort() : runScenario(sc)}
                disabled={!!running && !isRunning}
                className={cn(
                  "rounded-lg border py-2 text-[11px] font-mono uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition",
                  isRunning
                    ? "border-crit text-crit hover:bg-crit/10"
                    : "border-accent/50 text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed")}>
                {isRunning ? <><Square size={11} /> Abort</> : <><Play size={11} /> Launch</>}
              </button>
            </div>
          );
        })}
      </div>

      {/* live step tracker while a scenario runs */}
      {activeScenario && (
        <Panel title={`Scenario · ${activeScenario.name}`} aside="live execution" className="animate-riseIn">
          <div className="flex flex-wrap items-center gap-1">
            {activeScenario.steps.map((st, i) => {
              const state = stepStates[i] ?? "pending";
              return (
                <div key={i} className="flex items-center">
                  <div className={cn(
                    "px-3 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-2 transition",
                    state === "done"   ? "border-ok/50 text-ok bg-ok/10"
                  : state === "active" ? "border-accent text-accent bg-accent/10 shadow-glow animate-pulse2"
                  :                      "border-border text-muted")}>
                    {state === "done" ? "✓" : state === "active" ? "●" : "○"} {st.label}
                  </div>
                  {i < activeScenario.steps.length - 1 &&
                    <ChevronRight size={13} className="text-muted mx-0.5" />}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* manual injection + response feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Manual Fault Injection" aside="single craft · single fault">
          {/* craft picker */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-[10px] text-dim font-mono uppercase tracking-wide">Target:</span>
            {swarm.map(c => (
              <button key={c.id} onClick={() => setCraft(c.id)}
                className={cn("px-3 py-1 rounded-lg border text-[11px] font-mono transition",
                  target === c.id ? "border-accent text-accent bg-accent/10" : "border-border text-dim hover:border-accent/60")}>
                {c.id}
              </button>
            ))}
            <span className={cn("ml-auto text-[11px] font-mono",
              mode.tone === "ok" ? "text-ok" : mode.tone === "crit" ? "text-crit" :
              mode.tone === "warn" ? "text-warn" : "text-info")}>
              {target}: {mode.label}{faults.length ? ` · ${faults.join(", ")}` : ""}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MANUAL.map(m => (
              <button key={m.key}
                onClick={async () => { note(`Inject ${m.label} on ${target}`); await setFault(target, m.key); }}
                className={cn(
                  "rounded-lg border p-2.5 text-[10px] font-mono uppercase tracking-wide flex flex-col items-center gap-1.5 transition bg-bg/40",
                  m.tone === "crit"
                    ? "border-crit/30 text-crit/90 hover:border-crit hover:bg-crit/10"
                    : "border-warn/30 text-warn/90 hover:border-warn hover:bg-warn/10")}>
                {m.icon}{m.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Button tone="warn" className="flex-1 justify-center"
              onClick={() => { note(`Freeze CpuMon on ${target} (watchdog drill)`); controlTask(target, "CpuMon", "suspend"); }}>
              <Snowflake size={13} /> Freeze a task
            </Button>
            <Button tone="danger" className="flex-1 justify-center"
              onClick={() => { note(`Restart ${target}`); restartCraft(target); }}>
              <RotateCw size={13} /> Restart craft
            </Button>
          </div>
        </Panel>

        <Panel title="Mission Log" aside={`your actions + ${target} responses`}>
          <div className="space-y-1 max-h-[21rem] overflow-y-auto">
            {feed.map((f, i) => (
              <div key={`a${i}`} className="flex items-start gap-2 text-[11px] py-1">
                <span className="text-muted font-mono text-[9px] mt-0.5 shrink-0">{fmtTime(f.t)}</span>
                <span className="text-accent2 shrink-0">▸</span>
                <span className="text-slate-200">{f.text}</span>
              </div>
            ))}
            {craftLogs.map((l, i) => {
              const isWarn = l.level === "WARN";
              const isCrit = l.level === "ERROR" || l.level === "CRIT";
              return (
                <div key={`l${i}`} className="flex items-start gap-2 text-[11px] py-1 border-b border-border/20">
                  <span className="text-muted font-mono text-[9px] mt-0.5 shrink-0">{(l.ts / 1000).toFixed(0)}s</span>
                  <span className={isCrit ? "text-crit" : isWarn ? "text-warn" : "text-dim"}>
                    {respond(l.task, l.type, l.msg)}
                  </span>
                </div>
              );
            })}
            {!feed.length && !craftLogs.length && (
              <div className="text-muted text-center py-10 text-sm">
                Launch a scenario above, or inject a single fault.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function respond(task: string, type: string, msg: string): string {
  if (type === "Start" && task.startsWith("Emerg")) return "🛠 Spacecraft started an automatic recovery task";
  if (type === "Complete" && task.startsWith("Emerg")) return "✓ Recovery complete — problem fixed";
  if (type === "Retained") return "🗂 State history saved before recovery task closed";
  if (type === "RestartTask") return `↻ Watchdog restarting frozen task (${msg})`;
  if (type === "TaskHang") return `⚠ Task stopped responding (${msg})`;
  if (type === "Escalate") return "⛨ SafetyManager escalated to SAFE mode (fault overload)";
  if (type === "StateChange") return "↪ System mode changed";
  if (type === "TaskSuspend") return `❄ Task frozen for testing (${msg})`;
  if (type === "TaskResume") return `▶ Task resumed (${msg})`;
  return msg;
}
