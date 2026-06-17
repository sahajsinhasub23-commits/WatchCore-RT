import clsx, { ClassValue } from "clsx";
export const cn = (...args: ClassValue[]) => clsx(args);

export function fmtBytes(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + " GB";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + " MB";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + " KB";
  return n + " B";
}

export function fmtNum(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "G";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

export function fmtTime(ts?: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toISOString().substring(11, 19);
}

export function popcount(n: number): number {
  let c = 0; while (n) { c += n & 1; n >>>= 1; } return c;
}

export function modeColor(mode: string): string {
  switch (mode) {
    case "NORMAL":    return "text-ok border-ok";
    case "WARNING":   return "text-warn border-warn";
    case "EMERGENCY": return "text-crit border-crit animate-beat";
    case "SAFE":      return "text-orange-400 border-orange-400";
    case "RECOVERY":  return "text-info border-info";
    case "DEGRADED":  return "text-warn border-warn";
    default:          return "text-dim border-border";
  }
}

export function statePill(state: string): string {
  switch (state) {
    case "RUNNING":  return "text-ok bg-ok/10 border-ok/40";
    case "READY":    return "text-accent bg-accent/10 border-accent/40";
    case "BLOCKED":  return "text-muted bg-muted/10 border-muted/40";
    case "SUSPENDED":return "text-warn bg-warn/10 border-warn/40";
    case "DELETED":  return "text-crit bg-crit/10 border-crit/40";
    default:         return "text-dim bg-border/40 border-border";
  }
}

export function healthColor(h: number): string {
  if (h >= 80) return "text-ok";
  if (h >= 60) return "text-accent";
  if (h >= 40) return "text-warn";
  return "text-crit";
}
