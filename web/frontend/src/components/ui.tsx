import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title, aside, children, className,
}: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("panel topglow", className)}>
      {(title || aside) && (
        <div className="panel-header">
          {title && <span className="panel-title">▸ {title}</span>}
          {aside && <span className="panel-aside">{aside}</span>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Badge({
  children, tone = "default", className,
}: { children: ReactNode; tone?: "default" | "ok" | "warn" | "crit" | "info" | "accent"; className?: string }) {
  const map = {
    default: "border-border text-dim",
    ok:      "border-ok/60 text-ok bg-ok/10",
    warn:    "border-warn/60 text-warn bg-warn/10",
    crit:    "border-crit/60 text-crit bg-crit/10",
    info:    "border-info/60 text-info bg-info/10",
    accent:  "border-accent/60 text-accent bg-accent/10",
  } as const;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-mono rounded-full border",
      map[tone], className
    )}>{children}</span>
  );
}

export function Button({
  children, onClick, tone = "default", disabled, className,
}: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string;
     tone?: "default" | "primary" | "danger" | "warn" | "ok" }) {
  const map = {
    default: "border-border text-slate-200 hover:border-accent hover:text-accent",
    primary: "border-accent text-accent bg-accent/10 hover:bg-accent/20",
    danger:  "border-crit/60 text-crit hover:bg-crit/10",
    warn:    "border-warn/60 text-warn hover:bg-warn/10",
    ok:      "border-ok/60 text-ok hover:bg-ok/10",
  } as const;
  return (
    <button onClick={onClick} disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-mono tracking-wider transition disabled:opacity-40 disabled:cursor-not-allowed",
        map[tone], className
      )}
    >{children}</button>
  );
}

export function Spark({ data, color = "#818cf8", w = 80, h = 24 }:
  { data: number[]; color?: string; w?: number; h?: number }) {
  if (!data.length) return null;
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const range = Math.max(0.0001, max - min);
  const pts = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/* Circular progress ring gauge (SVG). */
export function Ring({
  value, max = 100, size = 120, stroke = 9, color = "#818cf8", label, sub, invert = false,
}: {
  value: number; max?: number; size?: number; stroke?: number;
  color?: string; label?: string; sub?: string; invert?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / max));
  const dash = c * frac;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                  stroke="#2f3766" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                  stroke={color} strokeWidth={stroke}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dasharray .5s ease" }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="font-mono font-bold text-xl leading-none" style={{ color }}>
              {Math.round(invert ? max - value : value)}
            </div>
            {sub && <div className="text-[9px] text-muted font-mono mt-0.5">{sub}</div>}
          </div>
        </div>
      </div>
      {label && <div className="text-[10px] uppercase tracking-[0.15em] text-dim font-mono">{label}</div>}
    </div>
  );
}

/* Segmented selector (craft tabs etc). */
export function Segmented({
  options, value, onChange,
}: { options: { id: string; label: string; tone?: "ok" | "warn" | "crit" | "info" }[];
     value: string; onChange: (id: string) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-panel/70 p-1 gap-1">
      {options.map(o => {
        const active = o.id === value;
        const dot = o.tone === "crit" ? "bg-crit" : o.tone === "warn" ? "bg-warn"
                  : o.tone === "info" ? "bg-info" : "bg-ok";
        return (
          <button key={o.id} onClick={() => onChange(o.id)}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-[12px] font-mono tracking-wide flex items-center gap-2 transition",
              active ? "bg-accent/15 text-accent border border-accent/40 shadow-glow"
                     : "text-dim hover:text-slate-100 border border-transparent")}>
            <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
