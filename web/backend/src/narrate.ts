import { bus } from "./ingest.js";
import type { RtosFrame, LogLine, Anomaly } from "./types.js";

/* ============================================================
 * Plain-language narrator
 *
 * Translates the raw telemetry stream into short, human-readable
 * lines printed to the orchestrator terminal. ASCII-only so it
 * renders correctly in any Windows console. Only meaningful
 * CHANGES are printed so the terminal stays readable.
 * ============================================================ */

const FAULT_WORDS: Record<number, string> = {
  0x01: "high temperature",
  0x02: "a radiation spike",
  0x04: "low battery",
  0x08: "low memory",
  0x10: "a communication timeout",
  0x20: "a frozen task",
  0x40: "a data queue overflow",
  0x80: "a deadlock",
  0x100: "low solar power",
  0x200: "an attitude/tumbling problem",
  0x400: "an abnormal tank pressure",
};

const MODE_WORDS: Record<string, string> = {
  NORMAL:    "back to normal operations",
  WARNING:   "showing a warning",
  DEGRADED:  "running degraded",
  EMERGENCY: "in EMERGENCY mode - handling a fault",
  SAFE:      "in SAFE MODE - locked down",
  RECOVERY:  "recovering",
};

function ts(): string {
  return new Date().toLocaleTimeString("en-GB"); /* HH:MM:SS */
}

/* Fixed-width ASCII tag so columns line up nicely. */
function line(tag: string, craft: string, text: string) {
  console.log(`${ts()}  ${("[" + tag + "]").padEnd(11)} ${craft.padEnd(6)} ${text}`);
}

interface Mem {
  onlineAt: number;
  lastMode: string;
  lastFaults: number;
  lastAnomalyAt: Record<string, number>;
}
const mem = new Map<string, Mem>();
function m(craft: string): Mem {
  let v = mem.get(craft);
  if (!v) { v = { onlineAt: 0, lastMode: "", lastFaults: 0, lastAnomalyAt: {} }; mem.set(craft, v); }
  return v;
}

function bitsToWords(mask: number): string[] {
  const out: string[] = [];
  for (const [bitStr, word] of Object.entries(FAULT_WORDS)) {
    if (mask & Number(bitStr)) out.push(word);
  }
  return out;
}

export function startNarrator() {
  console.log("");
  console.log("============================================================");
  console.log("   WatchCore Mission Control - live activity (plain English)");
  console.log("============================================================");
  console.log("");

  bus.on("frame", (f: RtosFrame) => {
    const s = m(f.craft);

    if (s.onlineAt === 0) {
      s.onlineAt = Date.now();
      s.lastMode = f.mode;
      s.lastFaults = f.faults;
      line("ONLINE", f.craft, "is online and reporting telemetry");
      return;
    }

    if (f.mode !== s.lastMode) {
      const word = MODE_WORDS[f.mode] ?? f.mode;
      const tag  = f.mode === "NORMAL"   ? "OK" :
                   f.mode === "RECOVERY" ? "RECOVERY" :
                   f.mode === "SAFE"     ? "SAFE" : "WARNING";
      line(tag, f.craft, `is now ${word}`);
      s.lastMode = f.mode;
    }

    if (f.faults !== s.lastFaults) {
      const added   = f.faults & ~s.lastFaults;
      const cleared = s.lastFaults & ~f.faults;
      bitsToWords(added).forEach(w   => line("FAULT", f.craft, `detected ${w}`));
      bitsToWords(cleared).forEach(w => line("OK", f.craft, `recovered from ${w}`));
      s.lastFaults = f.faults;
    }
  });

  bus.on("log", (l: LogLine) => {
    if (l.type === "RestartTask")
      line("RESTART", l.craft, `auto-restarting the task "${l.msg}" (it stopped responding)`);
    else if (l.type === "Start" && l.task.startsWith("Emerg"))
      line("RECOVERY", l.craft, "started an automatic recovery task");
    else if (l.type === "Complete" && l.task.startsWith("Emerg"))
      line("OK", l.craft, "finished a recovery task");
    else if (l.type === "MaxRestarts")
      line("SAFE", l.craft, `gave up restarting "${l.msg}" - entering safe mode`);
  });

  /* Inter-spacecraft relay events. */
  bus.on("relay-event", (ev: { down: string; relay: string; text: string }) => {
    line("RELAY", ev.relay, ev.text);
  });

  /* Anomalies: only HIGH severity, ignore the first 20s warm-up, and
   * throttle to one line per craft+metric per 15s. */
  bus.on("anomaly", (a: Anomaly) => {
    if (a.severity !== "high") return;
    const s = m(a.craft);
    const now = Date.now();
    if (s.onlineAt === 0 || now - s.onlineAt < 20_000) return;
    if (now - (s.lastAnomalyAt[a.metric] ?? 0) < 15_000) return;
    s.lastAnomalyAt[a.metric] = now;
    const nice: Record<string, string> = {
      cpu: "CPU load", heap: "free memory", temperature: "temperature",
      battery: "battery level", radiation: "radiation",
    };
    line("ALERT", a.craft, `unusual ${nice[a.metric] ?? a.metric} (${a.value.toFixed(1)})`);
  });
}
