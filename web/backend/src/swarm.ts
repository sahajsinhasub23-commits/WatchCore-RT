import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import { SWARM, RTOS_EXE, REPO_ROOT } from "./config.js";
import type { CraftStatus } from "./types.js";

/* ============================================================
 * Swarm process manager
 *
 * Spawns one WatchCore_RTOS.exe per spacecraft from SWARM[],
 * each on its own TCP port, with its craft id stamped via argv.
 * The RTOS exe must already be built (run build.bat first or
 * the start-all script handles it).
 * ============================================================ */

interface CraftRuntime {
  status: CraftStatus;
  proc: ChildProcess | null;
}

const runtimes = new Map<string, CraftRuntime>();

export function getCraftStatuses(): CraftStatus[] {
  return Array.from(runtimes.values()).map(r => r.status);
}

function ensureExe(): void {
  if (!fs.existsSync(RTOS_EXE)) {
    throw new Error(
      `WatchCore_RTOS.exe not found at ${RTOS_EXE}.\n` +
      `Run 'build.bat x64-debug' first.`
    );
  }
}

export function spawnCraft(id: string, port: number): CraftRuntime {
  ensureExe();
  const existing = runtimes.get(id);
  if (existing && existing.proc && !existing.proc.killed) return existing;

  const status: CraftStatus = {
    id, port, pid: null,
    status: "starting",
    startedAt: Date.now(),
    lastFrameAt: null,
    frameCount: 0,
  };

  const proc = spawn(RTOS_EXE, [String(port), id], {
    cwd: REPO_ROOT,
    env: { ...process.env, WATCHCORE_PORT: String(port), WATCHCORE_CRAFT: id },
    stdio: "ignore",      /* avoid blocking on the verbose stdout stream */
    detached: false,
  });

  status.pid = proc.pid ?? null;
  status.status = "online";

  proc.on("exit", (code) => {
    status.status = code === 0 ? "offline" : "crashed";
    console.log(`  - spacecraft ${id} stopped`);
  });
  proc.on("error", (err) => {
    console.error(`  · spacecraft ${id} failed to start:`, err.message);
    status.status = "crashed";
  });

  const runtime: CraftRuntime = { status, proc };
  runtimes.set(id, runtime);
  console.log(`  - spacecraft ${id} started (port ${port})`);
  return runtime;
}

export function killCraft(id: string): boolean {
  const r = runtimes.get(id);
  if (!r || !r.proc) return false;
  try {
    r.proc.kill();
    r.status.status = "offline";
    return true;
  } catch { return false; }
}

export function startSwarm(): void {
  for (const c of SWARM) spawnCraft(c.id, c.port);
}

export function killAll(): void {
  for (const r of runtimes.values()) {
    try { r.proc?.kill(); } catch {}
  }
}

export function recordFrameAck(craft: string): void {
  const r = runtimes.get(craft);
  if (!r) return;
  r.status.frameCount++;
  r.status.lastFrameAt = Date.now();
  if (r.status.status === "starting") r.status.status = "online";
}

/* graceful shutdown */
process.on("SIGINT",  () => { killAll(); process.exit(0); });
process.on("SIGTERM", () => { killAll(); process.exit(0); });
