import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import http from "node:http";
import { SWARM, BACKEND_PORT } from "./config.js";
import { startSwarm, getCraftStatuses, killCraft, spawnCraft } from "./swarm.js";
import { startIngest, bus } from "./ingest.js";
import { startNarrator } from "./narrate.js";
import { queryTimeline, queryAnomalies, queryBenchmarkSeries } from "./db.js";
import { buildReport } from "./report.js";
import { getHealthScore } from "./anomaly.js";
import { allCorrelations } from "./correlation.js";
import { startRelay, getRelayLinks } from "./relay.js";
import type { RtosFrame } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

/* ============================================================
 * REST API
 * ============================================================ */
app.get("/api/health", (_req, res) => res.json({ ok: true, t: Date.now() }));

app.get("/api/swarm", (_req, res) => {
  res.json({
    swarm: SWARM,
    runtime: getCraftStatuses(),
  });
});

app.post("/api/swarm/:id/restart", (req, res) => {
  const id = req.params.id;
  const meta = SWARM.find(s => s.id === id);
  if (!meta) return res.status(404).json({ ok: false, error: "unknown craft" });
  killCraft(id);
  setTimeout(() => spawnCraft(id, meta.port), 800);
  res.json({ ok: true, restarted: id });
});

/* Proxy fault / suspend / resume / bench commands to the chosen craft. */
async function proxy(id: string, path: string): Promise<any> {
  const meta = SWARM.find(s => s.id === id);
  if (!meta) throw new Error("unknown craft");
  const r = await fetch(`http://127.0.0.1:${meta.port}${path}`);
  return r.json().catch(() => ({ ok: r.ok }));
}

app.post("/api/craft/:id/fault", async (req, res) => {
  const { name, action = "set" } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "missing name" });
  try {
    const j = await proxy(req.params.id,
      `/api/fault?name=${encodeURIComponent(name)}&action=${encodeURIComponent(action)}`);
    res.json(j);
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/craft/:id/task/:taskName/:action", async (req, res) => {
  const action = req.params.action;
  if (action !== "suspend" && action !== "resume")
    return res.status(400).json({ ok: false, error: "bad action" });
  try {
    const j = await proxy(req.params.id,
      `/api/${action}?task=${encodeURIComponent(req.params.taskName)}`);
    res.json(j);
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/craft/:id/bench", async (req, res) => {
  try { res.json(await proxy(req.params.id, "/api/bench")); }
  catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/api/timeline", (req, res) => {
  res.json(queryTimeline({
    craft: req.query.craft as string | undefined,
    limit: Number(req.query.limit) || 500,
  }));
});

app.get("/api/anomalies", (req, res) => {
  res.json(queryAnomalies({
    craft: req.query.craft as string | undefined,
    limit: Number(req.query.limit) || 200,
  }));
});

app.get("/api/benchmarks/:craft", (req, res) => {
  res.json(queryBenchmarkSeries(req.params.craft, Number(req.query.limit) || 60));
});

app.get("/api/report", (_req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(buildReport());
});

app.get("/api/correlation", (_req, res) => {
  res.json(allCorrelations(SWARM.map(s => s.id)));
});

app.get("/api/relay", (_req, res) => {
  res.json(getRelayLinks());
});

/* Proxy the flight-recorder (black box) dump from a craft. */
app.get("/api/craft/:id/blackbox", async (req, res) => {
  try {
    const data = await proxy(req.params.id, "/api/blackbox");
    res.json(data);
  } catch (e: any) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

/* ============================================================
 * HTTP + WebSocket fan-out
 *
 * Browsers subscribe at ws://host:3000/live  and receive
 *   { type:"frame", frame: RtosFrame, health: 0..100 }
 *   { type:"log",   log:   LogLine }
 *   { type:"anomaly", anomaly: Anomaly }
 *   { type:"craft", crafts: CraftStatus[] }
 * ============================================================ */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/live" });

function broadcast(payload: any) {
  const json = JSON.stringify(payload);
  wss.clients.forEach(c => {
    if (c.readyState === 1) {
      try { c.send(json); } catch {}
    }
  });
}

bus.on("frame", (frame: RtosFrame) => {
  broadcast({ type: "frame", frame, health: getHealthScore(frame) });
});
bus.on("log", (log) => broadcast({ type: "log", log }));
bus.on("anomaly", (anomaly) => broadcast({ type: "anomaly", anomaly }));
bus.on("relay", (links) => broadcast({ type: "relay", links }));
bus.on("relay-event", (ev) => broadcast({ type: "relay-event", ev }));

setInterval(() => broadcast({ type: "craft", crafts: getCraftStatuses() }), 1000);

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", swarm: SWARM, crafts: getCraftStatuses() }));
});

/* ============================================================ */
console.log("Starting WatchCore Mission Control...");
console.log("Launching 4 spacecraft simulators (this can take a few seconds)...");
startSwarm();
startNarrator();
startRelay();
setTimeout(startIngest, 2500);

server.listen(BACKEND_PORT, () => {
  console.log(`Dashboard data server ready at http://localhost:${BACKEND_PORT}`);
  console.log("Open the dashboard at http://localhost:5173");
});
