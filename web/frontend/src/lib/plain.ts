/* Plain-language helpers shared by the Monitor and Simulate pages. */
import type { LogLine } from "./types";

export const FAULT_WORDS: Record<number, string> = {
  0x01:  "High temperature",
  0x02:  "Radiation spike",
  0x04:  "Low battery",
  0x08:  "Low memory",
  0x10:  "Communication timeout",
  0x20:  "Frozen task",
  0x40:  "Data queue overflow",
  0x80:  "Deadlock",
  0x100: "Low solar power",
  0x200: "Attitude / tumbling",
  0x400: "Abnormal pressure",
};

export function faultList(mask: number): string[] {
  const out: string[] = [];
  for (const [bit, word] of Object.entries(FAULT_WORDS)) {
    if (mask & Number(bit)) out.push(word);
  }
  return out;
}

/* How each fault was fixed — used by the "system stabilized" popup. */
export const RECOVERY_WORDS: Record<number, string> = {
  0x01:  "cooling task stabilized the temperature",
  0x02:  "shielding cleared the radiation alert",
  0x04:  "load-shedding restored the battery",
  0x08:  "freed caches to recover memory",
  0x10:  "re-acquired the downlink",
  0x20:  "watchdog restarted the frozen task",
  0x40:  "drained the backed-up queue",
  0x80:  "broke the deadlock",
  0x100: "switched to the battery bus",
  0x200: "attitude control re-stabilized the craft",
  0x400: "isolated the propellant line",
};

/* Build a "how it fixed" sentence from the faults that were active. */
export function recoverySummary(faultsBefore: number): string {
  const fixes: string[] = [];
  for (const [bit, word] of Object.entries(RECOVERY_WORDS)) {
    if (faultsBefore & Number(bit)) fixes.push(word);
  }
  if (fixes.length === 0) return "all systems returned to nominal";
  if (fixes.length === 1) return fixes[0];
  return fixes.slice(0, -1).join(", ") + " and " + fixes[fixes.length - 1];
}

export function modeWords(mode: string): { label: string; tone: "ok" | "warn" | "crit" | "info" } {
  switch (mode) {
    case "NORMAL":    return { label: "Healthy", tone: "ok" };
    case "WARNING":   return { label: "Warning", tone: "warn" };
    case "DEGRADED":  return { label: "Degraded", tone: "warn" };
    case "EMERGENCY": return { label: "Emergency", tone: "crit" };
    case "SAFE":      return { label: "Safe Mode", tone: "crit" };
    case "RECOVERY":  return { label: "Recovering", tone: "info" };
    default:          return { label: mode || "Offline", tone: "info" };
  }
}

export function healthWord(h: number): string {
  if (h >= 85) return "Excellent";
  if (h >= 70) return "Good";
  if (h >= 50) return "Fair";
  if (h >= 30) return "Poor";
  return "Critical";
}

/* Convert a raw RTOS log line into a friendly sentence. Returns null if the
 * line isn't interesting enough to show on the simplified dashboard. */
export function plainLog(l: LogLine): { text: string; tone: "ok" | "warn" | "crit" | "info" } | null {
  const t = l.type;
  if (t === "Start" && l.task.startsWith("Emerg"))
    return { text: "Started an automatic recovery", tone: "warn" };
  if (t === "Complete" && l.task.startsWith("Emerg"))
    return { text: "Recovery finished — back to normal", tone: "ok" };
  if (t === "RestartTask")
    return { text: `Restarting frozen task "${l.msg}"`, tone: "warn" };
  if (t === "TaskHang")
    return { text: `Task "${l.msg}" stopped responding`, tone: "crit" };
  if (t === "MaxRestarts")
    return { text: `Gave up on "${l.msg}" — entering safe mode`, tone: "crit" };
  if (t === "StateChange")
    return { text: "System mode changed", tone: "info" };
  if (t === "SetFault")
    return { text: `Fault injected: ${l.msg}`, tone: "warn" };
  if (t === "ClearFault")
    return { text: `Fault cleared: ${l.msg}`, tone: "ok" };
  if (t === "TaskSuspend")
    return { text: `Froze task "${l.msg}" (for testing)`, tone: "warn" };
  if (t === "TaskResume")
    return { text: `Resumed task "${l.msg}"`, tone: "ok" };
  return null;
}
