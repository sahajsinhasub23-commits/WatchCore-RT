import Database from "better-sqlite3";
import { DB_PATH } from "./config.js";
import type { Anomaly, TimelineEvent, BenchmarkRecord, LogLine, RtosFrame } from "./types.js";

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  craft TEXT, kind TEXT, ts INTEGER, level TEXT, message TEXT, data TEXT,
  receivedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_timeline_recv ON timeline(receivedAt);
CREATE INDEX IF NOT EXISTS idx_timeline_craft ON timeline(craft);

CREATE TABLE IF NOT EXISTS anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  craft TEXT, metric TEXT, value REAL, zscore REAL, ewma REAL,
  observedAt INTEGER, severity TEXT, predicted TEXT
);

CREATE TABLE IF NOT EXISTS frames (
  craft TEXT, receivedAt INTEGER, payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_frames_craft_recv ON frames(craft, receivedAt);

CREATE TABLE IF NOT EXISTS bench (
  craft TEXT, ts INTEGER,
  queueUs INTEGER, mutexUs INTEGER, notifyUs INTEGER, ctxUs INTEGER,
  jitterUs INTEGER, memUs INTEGER, runs INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bench_craft ON bench(craft, ts);
`);

const stTimelineInsert = db.prepare(
  `INSERT INTO timeline (craft, kind, ts, level, message, data, receivedAt)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const stAnomalyInsert = db.prepare(
  `INSERT INTO anomalies (craft, metric, value, zscore, ewma, observedAt, severity, predicted)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const stFrameInsert = db.prepare(
  `INSERT INTO frames (craft, receivedAt, payload) VALUES (?, ?, ?)`
);
const stBenchInsert = db.prepare(
  `INSERT INTO bench (craft, ts, queueUs, mutexUs, notifyUs, ctxUs, jitterUs, memUs, runs)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

export function recordTimeline(ev: Omit<TimelineEvent, "id"> & { receivedAt: number }): number {
  const r = stTimelineInsert.run(
    ev.craft, ev.kind, ev.ts, ev.level, ev.message, ev.data ?? null, ev.receivedAt
  );
  return Number(r.lastInsertRowid);
}

export function recordAnomaly(a: Omit<Anomaly, "id">): number {
  const r = stAnomalyInsert.run(
    a.craft, a.metric, a.value, a.zscore, a.ewma, a.observedAt, a.severity, a.predicted ?? null
  );
  return Number(r.lastInsertRowid);
}

export function recordFrame(craft: string, frame: RtosFrame): void {
  /* Sample 1 in 5 frames to keep the db slim during long demos. */
  if (frame.receivedAt % 5 === 0) {
    stFrameInsert.run(craft, frame.receivedAt, JSON.stringify(frame));
  }
}

export function recordBench(b: BenchmarkRecord): void {
  stBenchInsert.run(b.craft, b.ts, b.queueUs, b.mutexUs, b.notifyUs, b.ctxUs, b.jitterUs, b.memUs, b.runs);
}

export function queryTimeline(opts: { craft?: string; limit?: number; sinceMs?: number } = {}): TimelineEvent[] {
  const where: string[] = []; const args: any[] = [];
  if (opts.craft)   { where.push("craft = ?"); args.push(opts.craft); }
  if (opts.sinceMs) { where.push("receivedAt >= ?"); args.push(opts.sinceMs); }
  const sql = `SELECT * FROM timeline ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY receivedAt DESC LIMIT ?`;
  args.push(opts.limit ?? 500);
  return db.prepare(sql).all(...args) as TimelineEvent[];
}

export function queryAnomalies(opts: { craft?: string; limit?: number } = {}): Anomaly[] {
  const where: string[] = []; const args: any[] = [];
  if (opts.craft) { where.push("craft = ?"); args.push(opts.craft); }
  const sql = `SELECT * FROM anomalies ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY observedAt DESC LIMIT ?`;
  args.push(opts.limit ?? 100);
  return db.prepare(sql).all(...args) as Anomaly[];
}

export function queryBenchmarkSeries(craft: string, limit = 60): BenchmarkRecord[] {
  return db.prepare(
    `SELECT * FROM bench WHERE craft = ? ORDER BY ts DESC LIMIT ?`
  ).all(craft, limit) as BenchmarkRecord[];
}
