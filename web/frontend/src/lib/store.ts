import { create } from "./tinystore";
import { faultList, recoverySummary } from "./plain";
import type { RtosFrame, LogLine, CraftMeta, CraftStatus, Anomaly, RelayLink, Toast } from "./types";

interface State {
  connected: boolean;
  swarm: CraftMeta[];
  crafts: CraftStatus[];
  frames: Record<string, RtosFrame | undefined>;
  health: Record<string, number>;
  history: Record<string, RtosFrame[]>;   /* last N frames per craft */
  logs: LogLine[];                         /* global log ring */
  anomalies: Anomaly[];                    /* global anomaly ring */
  relays: RelayLink[];                     /* active inter-craft relays */
  toasts: Toast[];                         /* transient pill notifications */
}

const MAX_HISTORY = 120;
const MAX_LOGS = 400;
const MAX_ANOM = 200;
const MAX_TOASTS = 4;
const TOAST_TTL = 6000;

export const store = create<State>({
  connected: false,
  swarm: [],
  crafts: [],
  frames: {},
  health: {},
  history: {},
  logs: [],
  anomalies: [],
  relays: [],
  toasts: [],
});

/* ---- transient toast notifications ---- */
let toastSeq = 1;
export function pushToast(t: Omit<Toast, "id" | "ts">) {
  const toast: Toast = { ...t, id: toastSeq++, ts: Date.now() };
  const s = store.get();
  store.set({ toasts: [toast, ...s.toasts].slice(0, MAX_TOASTS) });
  setTimeout(() => dismissToast(toast.id), TOAST_TTL);
}
export function dismissToast(id: number) {
  const s = store.get();
  store.set({ toasts: s.toasts.filter(t => t.id !== id) });
}

/* per-craft memory used to detect transitions for notifications */
const lastMode = new Map<string, string>();
const lastFaults = new Map<string, number>();
const troubleFaults = new Map<string, number>();   /* all faults seen this episode */

let ws: WebSocket | null = null;
let reconnectDelay = 1000;

export function connectLive() {
  if (ws && ws.readyState <= 1) return;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    reconnectDelay = 1000;
    store.set({ connected: true });
  };
  ws.onclose = () => {
    store.set({ connected: false });
    setTimeout(connectLive, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.6, 6000);
  };
  ws.onerror = () => { try { ws?.close(); } catch {} };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      switch (msg.type) {
        case "hello": {
          store.set({ swarm: msg.swarm, crafts: msg.crafts });
          break;
        }
        case "craft": {
          store.set({ crafts: msg.crafts });
          break;
        }
        case "frame": {
          const f = msg.frame as RtosFrame;
          const s = store.get();
          const histList = s.history[f.craft] ?? [];
          const next = [...histList, f].slice(-MAX_HISTORY);
          store.set({
            frames: { ...s.frames, [f.craft]: f },
            health: { ...s.health, [f.craft]: msg.health },
            history: { ...s.history, [f.craft]: next },
          });
          detectNotifications(f);
          break;
        }
        case "log": {
          const s = store.get();
          store.set({ logs: [msg.log, ...s.logs].slice(0, MAX_LOGS) });
          break;
        }
        case "anomaly": {
          const s = store.get();
          store.set({ anomalies: [msg.anomaly, ...s.anomalies].slice(0, MAX_ANOM) });
          break;
        }
        case "relay": {
          store.set({ relays: msg.links ?? [] });
          break;
        }
      }
    } catch {}
  };
}

/* Detect mode / fault transitions per craft and raise pill notifications:
 *  - an EVENT pill when a new problem appears
 *  - a FIXED pill (with "how it fixed") when the craft returns to normal */
function detectNotifications(f: RtosFrame) {
  const prevMode = lastMode.get(f.craft);
  const prevFaults = lastFaults.get(f.craft) ?? 0;
  const curMode = f.mode;
  const curFaults = f.faults;

  /* First frame for this craft — just seed, don't notify. */
  if (prevMode === undefined) {
    lastMode.set(f.craft, curMode);
    lastFaults.set(f.craft, curFaults);
    return;
  }

  const wasBad = prevMode === "EMERGENCY" || prevMode === "SAFE" || prevMode === "WARNING" || prevFaults !== 0;
  const isBad  = curMode === "EMERGENCY" || curMode === "SAFE" || curMode === "WARNING" || curFaults !== 0;

  /* Accumulate every fault seen during the current trouble episode. */
  if (isBad) {
    troubleFaults.set(f.craft, (troubleFaults.get(f.craft) ?? 0) | curFaults);
  }

  /* New fault(s) appeared → EVENT pill. */
  const newFaults = curFaults & ~prevFaults;
  if (newFaults !== 0) {
    const names = faultList(newFaults);
    pushToast({
      craft: f.craft,
      kind: curMode === "SAFE" ? "warn" : "event",
      title: `${f.craft} · ${names[0] ?? "Fault detected"}`,
      detail: names.length > 1
        ? `${names.join(", ")} — autonomous recovery starting`
        : `Detected — autonomous recovery starting`,
    });
  } else if (!wasBad && isBad && curMode !== "NORMAL") {
    /* Mode worsened without a specific new fault bit. */
    pushToast({
      craft: f.craft, kind: "event",
      title: `${f.craft} · ${curMode}`,
      detail: "Condition changed — system responding",
    });
  }

  /* Returned to normal after trouble → FIXED pill with how it was fixed. */
  if (wasBad && curMode === "NORMAL" && curFaults === 0) {
    const episode = troubleFaults.get(f.craft) || prevFaults;
    pushToast({
      craft: f.craft, kind: "fixed",
      title: `${f.craft} · Stabilized`,
      detail: `Recovered — ${recoverySummary(episode)}.`,
    });
    troubleFaults.set(f.craft, 0);
  }

  lastMode.set(f.craft, curMode);
  lastFaults.set(f.craft, curFaults);
}

export type { State };
