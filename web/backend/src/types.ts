/* Shared TypeScript types used across the WatchCore orchestrator. */

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
  heap: number;
  min_heap: number;
  queue: number;
  queue_free: number;
  ipc: number;
  mode: "NORMAL" | "WARNING" | "DEGRADED" | "EMERGENCY" | "SAFE" | "RECOVERY" | string;
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
  logger: { bytes: number; dropped: number };
  bench: {
    q: number; mtx: number; ntf: number; cs: number;
    jit: number; mem: number; runs: number;
  };
  tasks: TaskSnapshot[];
  /* Server-stamped fields */
  receivedAt: number;
}

export interface LogLine {
  craft: string;
  ts: number;        /* RTOS ticks */
  level: "INFO" | "WARN" | "ERROR" | "CRIT" | string;
  mode: string;
  task: string;
  type: string;
  msg: string;
  receivedAt: number;
}

export interface CraftStatus {
  id: string;
  port: number;
  pid: number | null;
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
  id: number;
  craft: string;
  kind: "log" | "mode" | "fault" | "recovery" | "anomaly";
  ts: number;
  level: string;
  message: string;
  data?: string;
  receivedAt: number;
}

export interface BenchmarkRecord {
  craft: string;
  ts: number;
  queueUs: number;
  mutexUs: number;
  notifyUs: number;
  ctxUs: number;
  jitterUs: number;
  memUs: number;
  runs: number;
}
