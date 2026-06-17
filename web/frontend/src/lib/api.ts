/* REST client for the orchestrator endpoints used by the dashboard. */
import type { TimelineEvent, Correlation } from "./types";

export async function setFault(craft: string, name: string, action: "set" | "clear" = "set") {
  const r = await fetch(`/api/craft/${craft}/fault`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, action }),
  });
  return r.json();
}

export async function controlTask(craft: string, task: string, action: "suspend" | "resume") {
  const r = await fetch(`/api/craft/${craft}/task/${task}/${action}`, { method: "POST" });
  return r.json();
}

export async function restartCraft(craft: string) {
  const r = await fetch(`/api/swarm/${craft}/restart`, { method: "POST" });
  return r.json();
}

export async function runBench(craft: string) {
  const r = await fetch(`/api/craft/${craft}/bench`, { method: "POST" });
  return r.json();
}

export async function getCorrelation(): Promise<Correlation[]> {
  const r = await fetch(`/api/correlation`);
  return r.json();
}

export async function getTimeline(opts: { craft?: string; limit?: number } = {}): Promise<TimelineEvent[]> {
  const q = new URLSearchParams();
  if (opts.craft) q.set("craft", opts.craft);
  if (opts.limit) q.set("limit", String(opts.limit));
  const r = await fetch(`/api/timeline?${q.toString()}`);
  return r.json();
}

export function openReport() {
  window.open("/api/report", "_blank");
}

export async function getBlackbox(craft: string) {
  const r = await fetch(`/api/craft/${craft}/blackbox`);
  return r.json();
}

export async function getRelays() {
  const r = await fetch(`/api/relay`);
  return r.json();
}
