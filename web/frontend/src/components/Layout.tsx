import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, FlaskConical, Orbit, BarChart3 } from "lucide-react";
import { store } from "@/lib/store";
import { cn } from "@/lib/utils";
import AlertRibbon from "./AlertRibbon";
import Toasts from "./Toasts";

const NAV = [
  { to: "/",          label: "Fleet",     icon: Orbit },
  { to: "/monitor",   label: "Monitor",   icon: Activity },
  { to: "/simulate",  label: "Simulate",  icon: FlaskConical },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

function ledColor(mode?: string): string {
  switch (mode) {
    case "NORMAL":    return "bg-ok shadow-glowOk";
    case "WARNING":
    case "DEGRADED":  return "bg-warn shadow-glowWarn";
    case "EMERGENCY": return "bg-crit shadow-glowCrit animate-pulse2";
    case "SAFE":      return "bg-orange-400 shadow-glowCrit";
    case "RECOVERY":  return "bg-info";
    default:          return "bg-muted";
  }
}

/* T+ mission clock since the console connected. */
function MissionClock() {
  const connected = store.use(s => s.connected);
  const [t0] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const sec = Math.max(0, Math.floor((now - t0) / 1000));
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return (
    <div className="text-right leading-tight">
      <div className="text-[8px] font-mono tracking-[0.3em] text-dim uppercase">Mission Time</div>
      <div className={cn("font-mono text-[15px] font-bold tabular-nums",
        connected ? "text-accent" : "text-muted")}>
        T+ {h}:{m}:{s}
      </div>
    </div>
  );
}

/* Fixed dim starfield behind everything. */
function Starfield() {
  const stars = useMemo(() =>
    Array.from({ length: 90 }, (_, i) => ({
      left: `${(i * 37.7) % 100}%`,
      top: `${(i * 23.3 + 7) % 100}%`,
      size: 1 + ((i * 7) % 3) * 0.6,
      delay: `${(i % 10) * 0.45}s`,
      dur: `${3 + (i % 5)}s`,
    })), []);
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {stars.map((s, i) => (
        <span key={i}
          className="absolute rounded-full bg-slate-300 animate-twinkle"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size,
                   animationDelay: s.delay, animationDuration: s.dur }} />
      ))}
    </div>
  );
}

export default function Layout() {
  const connected = store.use(s => s.connected);
  const swarm     = store.use(s => s.swarm);
  const frames    = store.use(s => s.frames);
  const loc       = useLocation();
  const live = swarm.filter(c => frames[c.id]).length;

  return (
    <div className="min-h-screen flex flex-col">
      <Starfield />
      <div className="scanlines" />

      <header className="sticky top-0 z-40 backdrop-blur-md bg-panel/70 border-b border-border">
        <div className="flex items-center gap-5 px-6 py-2.5">
          {/* brand */}
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border border-accent/40 animate-[spin_9s_linear_infinite]"
                   style={{ borderTopColor: "#818cf8" }} />
              <div className="absolute inset-[5px] rounded-full bg-gradient-to-tr from-accent/20 to-info/20 grid place-items-center">
                <Orbit className="text-accent" size={16} />
              </div>
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-bold tracking-[0.25em]">WATCHCORE</div>
              <div className="text-[8px] text-dim font-mono tracking-[0.35em] uppercase">Mission Ops · FreeRTOS</div>
            </div>
          </div>

          {/* fleet LEDs */}
          <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-xl border border-border bg-bg/40">
            {swarm.map(c => (
              <NavLink key={c.id} to="/monitor" title={`${c.id} — ${frames[c.id]?.mode ?? "offline"}`}
                   className="flex flex-col items-center gap-1 cursor-pointer">
                <span className={cn("w-2.5 h-2.5 rounded-full transition", ledColor(frames[c.id]?.mode))} />
                <span className="text-[7px] font-mono text-muted">{c.id.replace("SC-0", "S")}</span>
              </NavLink>
            ))}
            <div className="w-px h-6 bg-border mx-1" />
            <div className="text-[9px] font-mono leading-tight">
              <div className={connected ? "text-ok" : "text-crit"}>
                {connected ? "● UPLINK" : "○ NO LINK"}
              </div>
              <div className="text-muted">{live}/{swarm.length || 4} online</div>
            </div>
          </div>

          {/* nav */}
          <nav className="ml-auto flex items-center gap-1.5">
            {NAV.map(n => {
              const active = loc.pathname === n.to;
              const Icon = n.icon;
              return (
                <NavLink key={n.to} to={n.to} end
                  className={cn(
                    "px-3.5 py-2 rounded-lg text-[11px] font-mono tracking-[0.15em] uppercase flex items-center gap-2 transition border",
                    active
                      ? "bg-accent/10 text-accent border-accent/40 shadow-glow"
                      : "text-dim hover:text-slate-100 hover:bg-panelHi/50 border-transparent")}>
                  <Icon size={13} /> {n.label}
                </NavLink>
              );
            })}
          </nav>

          <MissionClock />
        </div>
        <AlertRibbon />
      </header>

      <main className="flex-1 px-6 py-5">
        <Outlet />
      </main>

      <footer className="px-6 py-2.5 border-t border-border text-[9px] text-muted font-mono flex justify-between items-center">
        <span>WATCHCORE RTOS · 4-craft FreeRTOS constellation · 16 tasks / craft · 70+ kernel APIs</span>
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse2" />
          telemetry 8 Hz · plain-language log in the orchestrator terminal
        </span>
      </footer>

      <Toasts />
    </div>
  );
}
