import { recordTimeline } from "./db.js";
import type { RtosFrame } from "./types.js";

/* ============================================================
 * Autonomous recovery engine
 *
 * Watches each craft's frames and takes corrective action via
 * the C-side HTTP API.  The C watchdog handles task-hang
 * restart locally; this loop covers higher-level decisions:
 *   - clear stale faults that don't auto-clear
 *   - resume tasks that have been suspended for > N seconds
 *   - issue benchmark probes when the craft looks idle
 * ============================================================ */

interface CraftMemory {
  lastSafeBeenAt: number | null;
  lastFaultMask: number;
  lastFaultChangeAt: number;
}

const memory = new Map<string, CraftMemory>();

function mem(craft: string): CraftMemory {
  let m = memory.get(craft);
  if (!m) { m = { lastSafeBeenAt: null, lastFaultMask: 0, lastFaultChangeAt: 0 }; memory.set(craft, m); }
  return m;
}

async function hit(port: number, path: string): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${port}${path}`).catch(() => {});
  } catch {}
}

const FAULT_NAMES: Record<number, string> = {
  0x01: "temp",
  0x02: "radiation",
  0x04: "battery",
  0x08: "memory",
  0x10: "comm",
  0x20: "hang",
  0x40: "queue",
  0x80: "deadlock",
};

export function recoveryLoop(frame: RtosFrame, port: number): void {
  const m = mem(frame.craft);
  if (frame.faults !== m.lastFaultMask) {
    m.lastFaultMask = frame.faults;
    m.lastFaultChangeAt = frame.receivedAt;
  }

  /* If a fault has been latched for > 12 s and isn't a hardware-sensor type,
   * clear it - it represents a stale soft fault (queue overflow / comm timeout). */
  if (frame.faults && frame.receivedAt - m.lastFaultChangeAt > 12_000) {
    for (const [bitStr, name] of Object.entries(FAULT_NAMES)) {
      const bit = Number(bitStr);
      if ((frame.faults & bit) && (bit & 0x70)) {  /* hang/queue/comm */
        void hit(port, `/api/fault?name=${name}&action=clear`);
        recordTimeline({
          craft: frame.craft, kind: "recovery", ts: frame.ticks, level: "INFO",
          message: `auto-cleared stale ${name} fault`,
          receivedAt: frame.receivedAt,
        });
      }
    }
    m.lastFaultChangeAt = frame.receivedAt; /* throttle */
  }

  /* If the craft has been in SAFE for > 30 s, attempt one bench probe to
   * keep the dashboard's benchmark stream alive. */
  if (frame.mode === "SAFE") {
    if (m.lastSafeBeenAt === null) m.lastSafeBeenAt = frame.receivedAt;
    if (frame.receivedAt - m.lastSafeBeenAt > 30_000) {
      void hit(port, `/api/bench`);
      m.lastSafeBeenAt = frame.receivedAt;
      recordTimeline({
        craft: frame.craft, kind: "recovery", ts: frame.ticks, level: "WARN",
        message: "SAFE mode > 30s, issuing benchmark probe",
        receivedAt: frame.receivedAt,
      });
    }
  } else {
    m.lastSafeBeenAt = null;
  }
}
