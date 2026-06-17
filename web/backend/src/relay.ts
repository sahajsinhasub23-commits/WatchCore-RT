import { bus } from "./ingest.js";
import { SWARM } from "./config.js";
import type { RtosFrame } from "./types.js";

/* ============================================================
 * Constellation relay (inter-spacecraft communication)
 *
 * In a real satellite fleet, when one craft loses its link to
 * the ground (comm timeout), a healthy neighbour relays its
 * telemetry. This module watches every craft's comm state and,
 * when one goes dark, picks the healthiest other craft to act
 * as its relay. It emits "relay" events that the dashboard draws
 * as a link between the two craft on the orbital map.
 *
 * COMM_TIMEOUT fault bit = 0x10.
 * ============================================================ */

const FAULT_COMM = 0x10;

export interface RelayLink {
  down: string;      /* craft that lost its link */
  relay: string;     /* craft relaying for it */
  since: number;     /* when the relay started */
}

const lastFrame = new Map<string, RtosFrame>();
let links: RelayLink[] = [];

function isCommDown(f?: RtosFrame): boolean {
  return !!f && (f.faults & FAULT_COMM) !== 0;
}

/* Health proxy: prefer craft that are online, not comm-down, low faults. */
function healthOf(f?: RtosFrame): number {
  if (!f) return -1;
  let h = 100;
  if (f.faults) h -= 20;
  if (isCommDown(f)) h -= 100;
  if (f.mode === "EMERGENCY" || f.mode === "SAFE") h -= 30;
  return h;
}

function recompute() {
  const ids = SWARM.map(s => s.id);
  const next: RelayLink[] = [];

  for (const id of ids) {
    const f = lastFrame.get(id);
    if (!isCommDown(f)) continue;

    /* Find the healthiest OTHER craft that is not itself comm-down. */
    let best: string | null = null;
    let bestH = -1;
    for (const other of ids) {
      if (other === id) continue;
      const of = lastFrame.get(other);
      if (isCommDown(of)) continue;
      const h = healthOf(of);
      if (h > bestH) { bestH = h; best = other; }
    }
    if (best) {
      const existing = links.find(l => l.down === id);
      next.push({ down: id, relay: best, since: existing?.since ?? Date.now() });
    }
  }

  /* Emit changes only. */
  const changed =
    next.length !== links.length ||
    next.some((l, i) => links[i]?.down !== l.down || links[i]?.relay !== l.relay);

  if (changed) {
    /* New relays that did not exist before -> narrate. */
    for (const l of next) {
      const was = links.find(x => x.down === l.down);
      if (!was || was.relay !== l.relay) {
        bus.emit("relay-event", {
          down: l.down, relay: l.relay,
          text: `${l.relay} is now relaying telemetry for ${l.down} (link down)`,
        });
      }
    }
    for (const old of links) {
      if (!next.find(x => x.down === old.down)) {
        bus.emit("relay-event", {
          down: old.down, relay: old.relay,
          text: `${old.down} re-acquired its own ground link (relay ended)`,
        });
      }
    }
    links = next;
    bus.emit("relay", links);
  }
}

export function startRelay() {
  bus.on("frame", (f: RtosFrame) => {
    lastFrame.set(f.craft, f);
    recompute();
  });
}

export function getRelayLinks(): RelayLink[] {
  return links;
}
