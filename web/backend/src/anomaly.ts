import { ANOMALY } from "./config.js";
import { recordAnomaly, recordTimeline } from "./db.js";
import type { Anomaly, RtosFrame } from "./types.js";

/* ============================================================
 * Online z-score + EWMA anomaly detector
 *
 * For each (craft, metric) pair we maintain a sliding window
 * for mean / std calculation and an EWMA series for forecasting.
 * Any sample whose z-score exceeds the threshold becomes an
 * Anomaly with an associated severity bucket.
 * ============================================================ */

interface MetricState {
  window: number[];
  ewma: number | null;
}

const METRICS = ["cpu", "heap", "temperature", "battery", "radiation",
                 "solar", "attitude", "pressure", "comm"] as const;
type MetricName = typeof METRICS[number];

const states = new Map<string, Map<MetricName, MetricState>>();

function getState(craft: string, metric: MetricName): MetricState {
  let craftMap = states.get(craft);
  if (!craftMap) { craftMap = new Map(); states.set(craft, craftMap); }
  let st = craftMap.get(metric);
  if (!st) { st = { window: [], ewma: null }; craftMap.set(metric, st); }
  return st;
}

function pushSample(st: MetricState, value: number): { mean: number; std: number } {
  st.window.push(value);
  if (st.window.length > ANOMALY.windowSize) st.window.shift();
  st.ewma = st.ewma === null ? value : ANOMALY.ewmaAlpha * value + (1 - ANOMALY.ewmaAlpha) * st.ewma;
  const mean = st.window.reduce((a, b) => a + b, 0) / st.window.length;
  const variance = st.window.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, st.window.length - 1);
  return { mean, std: Math.sqrt(variance) };
}

function severityFor(z: number): "low" | "medium" | "high" {
  const az = Math.abs(z);
  if (az >= ANOMALY.zHigh) return "high";
  if (az >= ANOMALY.zMedium) return "medium";
  return "low";
}

function predictedTrend(st: MetricState): string | undefined {
  if (st.window.length < ANOMALY.predictHorizonFrames || st.ewma === null) return;
  const recent = st.window.slice(-ANOMALY.predictHorizonFrames);
  const first = recent[0];
  const last  = recent[recent.length - 1];
  const slope = (last - first) / recent.length;
  if (Math.abs(slope) < 1e-3) return;
  /* Project EWMA out by another horizon. */
  const horizon = ANOMALY.predictHorizonFrames * 5; /* ~25s ahead */
  const projected = st.ewma + slope * horizon;
  if (Math.abs(projected - st.ewma) < 1) return;
  return slope > 0
    ? `rising → ~${projected.toFixed(1)} in ${horizon} frames`
    : `falling → ~${projected.toFixed(1)} in ${horizon} frames`;
}

export function analyzeFrame(frame: RtosFrame): Anomaly[] {
  const out: Anomaly[] = [];
  const samples: Record<MetricName, number> = {
    cpu: frame.cpu,
    heap: frame.heap,
    temperature: frame.sensors.temperature,
    battery: frame.sensors.battery,
    radiation: frame.sensors.radiation,
    solar: frame.sensors.solar,
    attitude: frame.sensors.attitude,
    pressure: frame.sensors.pressure,
    comm: frame.sensors.comm,
  };

  for (const metric of METRICS) {
    const value = samples[metric];
    if (value === undefined || value === null || Number.isNaN(value)) continue;
    const st = getState(frame.craft, metric);
    const before = st.window.length;
    const { mean, std } = pushSample(st, value);
    if (before < 12) continue;          /* need a warm-up window */
    const z = std > 1e-9 ? (value - mean) / std : 0;
    const sev = severityFor(z);
    if (sev === "low") continue;

    const an: Omit<Anomaly, "id"> = {
      craft: frame.craft, metric, value,
      zscore: z, ewma: st.ewma!,
      observedAt: frame.receivedAt,
      severity: sev,
      predicted: predictedTrend(st),
    };
    const id = recordAnomaly(an);
    out.push({ id, ...an });
    recordTimeline({
      craft: frame.craft, kind: "anomaly", ts: frame.ticks, level: sev.toUpperCase(),
      message: `${metric}=${value.toFixed(2)} z=${z.toFixed(2)} ewma=${st.ewma!.toFixed(2)}`,
      receivedAt: frame.receivedAt,
      data: an.predicted,
    });
  }
  return out;
}

export function getHealthScore(frame: RtosFrame): number {
  /* 0..100 health score. Watchdog state, fault count, heap pressure, CPU,
   * power token availability all count. */
  let score = 100;
  if (frame.faults) score -= Math.min(40, 10 * popcount(frame.faults));
  if (frame.mode === "EMERGENCY") score -= 20;
  if (frame.mode === "SAFE")      score -= 35;
  if (frame.mode === "RECOVERY")  score -= 10;
  if (frame.heap < 8192)          score -= 10;
  if (frame.heap < 4096)          score -= 15;
  if (frame.cpu > 85)             score -= 10;
  if (frame.power && frame.power.free === 0) score -= 5;
  return Math.max(0, Math.min(100, score));
}

function popcount(n: number): number {
  let c = 0; while (n) { c += n & 1; n >>>= 1; } return c;
}
