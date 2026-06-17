/* Mirrors web/backend/src/types.ts */

export interface TaskSnapshot {
  name: string;
  prio: number;
  state: "RUNNING" | "READY" | "BLOCKED" | "SUSPENDED" | "DELETED" | string;
  stack: number;
  runtime: number;
}

export interface RtosFrame {
  craft: string;
  ticks: number;
  heap: number; min_heap: number;
  queue: number; queue_free: number; ipc: number;
  mode: string;
  faults: number;
  cpu: number;
  sensors: {
    temperature: number; battery: number; radiation: number;
    solar: number; attitude: number; pressure: number; comm: number;
  };
  mutex: { spi: boolean; i2c: boolean; uart: boolean };
  samples: number;
  power: { free: number; total: number };
  cmd: { ok: number; bad: number };
  emergency: number;
  watchdog: { watched: number };
  safety: { score: number; escalations: number; min_stack: number };
  energy: { sunlit: boolean; load: number };
  blackbox: number;
  logger: { bytes: number; dropped: number };
  bench: { q: number; mtx: number; ntf: number; cs: number; jit: number; mem: number; runs: number };
  tasks: TaskSnapshot[];
  receivedAt: number;
}

export interface LogLine {
  craft: string;
  ts: number;
  level: string; mode: string; task: string; type: string; msg: string;
  receivedAt: number;
}

export interface CraftMeta {
  id: string; port: number; orbit: string; label: string;
}

export interface CraftStatus {
  id: string; port: number; pid: number | null;
  status: "starting" | "online" | "offline" | "crashed";
  startedAt: number;
  lastFrameAt: number | null;
  frameCount: number;
}

export interface Anomaly {
  id: number;
  craft: string;
  metric: string;
  value: number;
  zscore: number;
  ewma: number;
  observedAt: number;
  severity: "low" | "medium" | "high";
  predicted?: string;
}

export interface TimelineEvent {
  id: number; craft: string;
  kind: "log" | "mode" | "fault" | "recovery" | "anomaly";
  ts: number; level: string; message: string; data?: string;
  receivedAt: number;
}

export const FAULTS = [
  { key: "temp",      bit: 0x01,  name: "HIGH TEMP" },
  { key: "radiation", bit: 0x02,  name: "RADIATION" },
  { key: "battery",   bit: 0x04,  name: "LOW BATTERY" },
  { key: "memory",    bit: 0x08,  name: "MEMORY EXH" },
  { key: "comm",      bit: 0x10,  name: "COMM TIMEOUT" },
  { key: "hang",      bit: 0x20,  name: "TASK HANG" },
  { key: "queue",     bit: 0x40,  name: "QUEUE OVERFLOW" },
  { key: "deadlock",  bit: 0x80,  name: "DEADLOCK" },
  { key: "solar",     bit: 0x100, name: "LOW SOLAR" },
  { key: "attitude",  bit: 0x200, name: "ATTITUDE" },
  { key: "pressure",  bit: 0x400, name: "PRESSURE" },
];

export interface Correlation {
  craft: string;
  samples: number;
  cpu_vs_battery: number;
  cpu_vs_memory: number;
  memory_vs_battery: number;
  cpu_vs_tasks: number;
  insight: string;
}

export interface RelayLink {
  down: string;
  relay: string;
  since: number;
}

export interface Toast {
  id: number;
  craft: string;
  kind: "event" | "fixed" | "warn" | "info";
  title: string;
  detail: string;
  ts: number;
}

export interface BlackBoxRecord {
  tick: number;
  level: string;
  tag: string;
  text: string;
}
