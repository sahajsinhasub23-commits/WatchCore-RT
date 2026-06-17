import type { RtosFrame } from "./types.js";

/* ============================================================
 * Correlation analysis  (assignment requirement:
 * "Correlation analysis between CPU, memory, and battery
 *  health and task management")
 *
 * Maintains a rolling window per craft and computes Pearson
 * correlation coefficients between the key health signals.
 * r ranges -1..+1:
 *   +1 = move together, -1 = move opposite, 0 = unrelated.
 * ============================================================ */

const WINDOW = 60;

interface Win {
  cpu: number[];
  heap: number[];
  battery: number[];
  tasks: number[];
}

const wins = new Map<string, Win>();

function win(craft: string): Win {
  let w = wins.get(craft);
  if (!w) { w = { cpu: [], heap: [], battery: [], tasks: [] }; wins.set(craft, w); }
  return w;
}

function push(arr: number[], v: number) {
  arr.push(v);
  if (arr.length > WINDOW) arr.shift();
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 8) return 0;
  const xa = a.slice(-n), xb = b.slice(-n);
  const ma = xa.reduce((s, v) => s + v, 0) / n;
  const mb = xb.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const va = xa[i] - ma, vb = xb[i] - mb;
    num += va * vb; da += va * va; db += vb * vb;
  }
  if (da === 0 || db === 0) return 0;
  return Math.max(-1, Math.min(1, num / Math.sqrt(da * db)));
}

export function observe(frame: RtosFrame) {
  const w = win(frame.craft);
  push(w.cpu, frame.cpu);
  push(w.heap, frame.heap);
  push(w.battery, frame.sensors.battery);
  push(w.tasks, frame.tasks.length);
}

export interface CorrelationResult {
  craft: string;
  samples: number;
  cpu_vs_battery: number;
  cpu_vs_memory: number;
  memory_vs_battery: number;
  cpu_vs_tasks: number;
  insight: string;
}

function describe(r: CorrelationResult): string {
  const strong = (x: number) => Math.abs(x) >= 0.6;
  if (strong(r.cpu_vs_battery) && r.cpu_vs_battery < 0)
    return "Higher CPU load is draining the battery faster.";
  if (strong(r.cpu_vs_memory) && r.cpu_vs_memory < 0)
    return "Rising CPU load is consuming free memory.";
  if (strong(r.cpu_vs_tasks))
    return "CPU load tracks the number of active tasks.";
  if (strong(r.memory_vs_battery))
    return "Memory and battery health are moving together.";
  return "No strong correlation right now — systems are independent.";
}

export function correlationFor(craft: string): CorrelationResult {
  const w = win(craft);
  const res: CorrelationResult = {
    craft,
    samples: w.cpu.length,
    cpu_vs_battery:   pearson(w.cpu, w.battery),
    cpu_vs_memory:    pearson(w.cpu, w.heap),
    memory_vs_battery:pearson(w.heap, w.battery),
    cpu_vs_tasks:     pearson(w.cpu, w.tasks),
    insight: "",
  };
  res.insight = describe(res);
  return res;
}

export function allCorrelations(crafts: string[]): CorrelationResult[] {
  return crafts.map(correlationFor);
}
