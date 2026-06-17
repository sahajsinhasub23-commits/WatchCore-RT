import { useEffect, useState } from "react";

/* ============================================================
 * BootOverlay — short "establishing uplink" sequence shown on
 * load. Pure theatre, but it sets the mission-ops tone before
 * the dashboard fades in. Click anywhere to skip.
 * ============================================================ */

const LINES = [
  "WATCHCORE MISSION OPS  v2.0",
  "ESTABLISHING UPLINK ............... OK",
  "AUTHENTICATING GROUND STATION ..... OK",
  "ACQUIRING FLEET TELEMETRY ......... OK",
  "SYNCING 4 SPACECRAFT .............. OK",
  "ALL SYSTEMS NOMINAL — WELCOME, OPERATOR",
];

const STEP_MS = 330;

export default function BootOverlay({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (shown < LINES.length) {
      const t = setTimeout(() => setShown(s => s + 1), STEP_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setFading(true), 500);
    const t2 = setTimeout(onDone, 950);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [shown, onDone]);

  return (
    <div
      onClick={onDone}
      className="fixed inset-0 z-[100] bg-bg grid place-items-center cursor-pointer transition-opacity duration-500"
      style={{ opacity: fading ? 0 : 1 }}>
      <div className="w-[min(560px,90vw)]">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-accent to-info grid place-items-center shadow-glow">
            <div className="w-9 h-9 rounded-lg bg-bg grid place-items-center">
              <span className="text-accent text-lg">◉</span>
            </div>
          </div>
          <div>
            <div className="font-bold tracking-[0.25em] text-slate-100">WATCHCORE</div>
            <div className="text-[9px] font-mono tracking-[0.4em] text-dim uppercase">Mission Operations Console</div>
          </div>
        </div>
        <div className="panel p-5 font-mono text-[12px] space-y-2 min-h-[180px]">
          {LINES.slice(0, shown).map((l, i) => (
            <div key={i} className="boot-line flex">
              <span className="text-muted mr-3">{String(i).padStart(2, "0")}</span>
              <span className={i === LINES.length - 1 ? "text-ok" : "text-slate-300"}>{l}</span>
            </div>
          ))}
          {shown < LINES.length && (
            <span className="inline-block w-2 h-4 bg-accent animate-blinkHard align-middle" />
          )}
        </div>
        <div className="text-center text-[9px] font-mono text-muted mt-3">click to skip</div>
      </div>
    </div>
  );
}
