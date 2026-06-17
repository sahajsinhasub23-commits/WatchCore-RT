import EventSource from "eventsource";
import { SWARM } from "./config.js";
import { recordFrameAck } from "./swarm.js";
import { recordFrame, recordTimeline, recordBench } from "./db.js";
import { analyzeFrame } from "./anomaly.js";
import { observe as observeCorrelation } from "./correlation.js";
import { recoveryLoop } from "./recovery.js";
import type { RtosFrame, LogLine } from "./types.js";
import EventEmitter from "node:events";

export const bus = new EventEmitter();
bus.setMaxListeners(64);

const LOG_RX = /^\[(\d+)\]\s*\[(\w+)\]\s*\[(\w+)\]\s*\[(\w+)\]\s*\[([^\]]+)\]\s*-\s*(.*)$/;

function parseLog(craft: string, raw: string): LogLine | null {
  const m = LOG_RX.exec(raw);
  if (!m) return null;
  return {
    craft,
    ts: parseInt(m[1], 10),
    level: m[2],
    mode: m[3],
    task: m[4],
    type: m[5],
    msg: m[6],
    receivedAt: Date.now(),
  };
}

function startCraftFeed(craft: string, port: number) {
  const url = `http://127.0.0.1:${port}/telemetry`;
  let es: EventSource | null = null;
  let backoff = 500;
  let stopped = false;

  const open = () => {
    if (stopped) return;
    es = new EventSource(url);
    es.onopen = () => { backoff = 500; };
    es.onmessage = (ev: MessageEvent) => {
      try {
        const obj = JSON.parse(ev.data as string);
        if ("log" in obj) {
          const ll = parseLog(craft, obj.log);
          if (ll) {
            bus.emit("log", ll);
            recordTimeline({
              craft: ll.craft, kind: "log", ts: ll.ts, level: ll.level,
              message: `${ll.task}·${ll.type} ${ll.msg}`, receivedAt: ll.receivedAt,
            });
            /* Mode-change events get a separate kind for the timeline UI. */
            if (ll.type === "StateChange") {
              recordTimeline({
                craft: ll.craft, kind: "mode", ts: ll.ts, level: ll.level,
                message: ll.msg, receivedAt: ll.receivedAt,
              });
            }
          }
        } else {
          const frame = obj as RtosFrame;
          frame.craft = frame.craft || craft;
          frame.receivedAt = Date.now();
          bus.emit("frame", frame);
          recordFrame(craft, frame);
          recordFrameAck(craft);
          if (frame.bench) {
            recordBench({
              craft, ts: frame.ticks,
              queueUs: frame.bench.q, mutexUs: frame.bench.mtx,
              notifyUs: frame.bench.ntf, ctxUs: frame.bench.cs,
              jitterUs: frame.bench.jit, memUs: frame.bench.mem, runs: frame.bench.runs,
            });
          }
          observeCorrelation(frame);
          analyzeFrame(frame).forEach(a => bus.emit("anomaly", a));
          recoveryLoop(frame, port);
        }
      } catch (e) { /* ignore parse errors */ }
    };
    es.onerror = () => {
      if (stopped) return;
      es?.close(); es = null;
      setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 8000);
    };
  };
  open();
  return () => { stopped = true; es?.close(); };
}

export function startIngest(): void {
  for (const c of SWARM) {
    /* Stagger initial connection so we don't hammer the loopback during start. */
    setTimeout(() => startCraftFeed(c.id, c.port), 1500);
  }
}
