import { useEffect, useMemo, useRef, useState } from "react";
import { store } from "@/lib/store";
import { modeWords, faultList } from "@/lib/plain";
import { popcount } from "@/lib/utils";

/* ============================================================
 * OrbitMap — animated orbital constellation.
 * Earth at center, one elliptical orbit ring per spacecraft,
 * craft dots move along their orbit in real time, colored by
 * system mode, with a rotating radar sweep underneath.
 * ============================================================ */

const W = 720, H = 460;
const CX = W / 2, CY = H / 2;

const ORBITS = [
  { rx: 320, ry: 168, speed: 0.16, phase: 0.0 },
  { rx: 262, ry: 138, speed: 0.22, phase: 2.1 },
  { rx: 204, ry: 108, speed: 0.30, phase: 4.2 },
  { rx: 148, ry:  78, speed: 0.42, phase: 1.1 },
];

function modeColor(mode?: string): string {
  switch (mode) {
    case "NORMAL":    return "#4ade80";
    case "WARNING":
    case "DEGRADED":  return "#fbbf24";
    case "EMERGENCY": return "#f87171";
    case "SAFE":      return "#fb923c";
    case "RECOVERY":  return "#a78bfa";
    default:          return "#576582";
  }
}

export default function OrbitMap({
  selected, onSelect,
}: { selected: string; onSelect: (id: string) => void }) {
  const swarm  = store.use(s => s.swarm);
  const frames = store.use(s => s.frames);
  const relays = store.use(s => s.relays);

  /* Single rAF clock drives craft + sweep angles. */
  const [t, setT] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const t0 = performance.now();
    const tick = (now: number) => {
      setT((now - t0) / 1000);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  /* Static starfield inside the map. */
  const stars = useMemo(() =>
    Array.from({ length: 70 }, (_, i) => ({
      x: ((i * 137.5) % W),
      y: ((i * 89.3 + 31) % H),
      r: 0.4 + ((i * 7) % 10) / 9,
      o: 0.15 + ((i * 13) % 10) / 14,
    })), []);

  const sweepAngle = (t * 40) % 360;

  /* Pre-compute every craft's current screen position so relay links can
   * be drawn between them. */
  const pos: Record<string, { x: number; y: number; a: number }> = {};
  swarm.forEach((c, i) => {
    const o = ORBITS[i % ORBITS.length];
    const a = o.phase + t * o.speed;
    pos[c.id] = { x: CX + o.rx * Math.cos(a), y: CY + o.ry * Math.sin(a), a };
  });

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block select-none">
        <defs>
          <radialGradient id="earth" cx="38%" cy="32%">
            <stop offset="0%"  stopColor="#3b82f6" />
            <stop offset="55%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#0c1a3a" />
          </radialGradient>
          <radialGradient id="atmo" cx="50%" cy="50%">
            <stop offset="62%" stopColor="transparent" />
            <stop offset="86%" stopColor="rgba(129,140,248,.20)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="rgba(168,85,247,0)" />
            <stop offset="100%" stopColor="rgba(129,140,248,.30)" />
          </linearGradient>
        </defs>

        {/* stars */}
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#9fc3e8" opacity={s.o} />
        ))}

        {/* radar sweep wedge */}
        <g transform={`rotate(${sweepAngle} ${CX} ${CY})`} opacity={0.6}>
          <path d={`M ${CX} ${CY} L ${CX + 340} ${CY} A 340 340 0 0 0 ${CX + 340 * Math.cos(-0.5)} ${CY + 340 * Math.sin(-0.5)} Z`}
                fill="url(#sweep)" />
        </g>

        {/* orbit rings */}
        {ORBITS.map((o, i) => (
          <ellipse key={i} cx={CX} cy={CY} rx={o.rx} ry={o.ry}
                   fill="none" stroke="#1f2a44" strokeWidth="1"
                   strokeDasharray="3 6" />
        ))}

        {/* inter-spacecraft relay links */}
        {relays.map((rl, i) => {
          const a = pos[rl.relay], b = pos[rl.down];
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          return (
            <g key={i}>
              <path d={`M ${a.x} ${a.y} Q ${mx} ${my - 24} ${b.x} ${b.y}`}
                    fill="none" stroke="#fcd34d" strokeWidth="1.6"
                    strokeDasharray="6 6" className="relay-link" opacity={0.85}
                    style={{ filter: "drop-shadow(0 0 4px #fcd34d)" }} />
              <text x={mx} y={my - 28} textAnchor="middle" fill="#fcd34d"
                    fontSize="8" fontFamily="JetBrains Mono, monospace">RELAY</text>
            </g>
          );
        })}

        {/* Earth */}
        <circle cx={CX} cy={CY} r={64} fill="url(#atmo)" />
        <circle cx={CX} cy={CY} r={44} fill="url(#earth)" />
        <ellipse cx={CX - 10} cy={CY - 8} rx={16} ry={9} fill="rgba(255,255,255,.10)" />
        <ellipse cx={CX + 12} cy={CY + 12} rx={12} ry={6} fill="rgba(255,255,255,.07)" />
        <text x={CX} y={CY + 60} textAnchor="middle"
              fill="#576582" fontSize="9" fontFamily="JetBrains Mono, monospace"
              letterSpacing="3">EARTH</text>

        {/* spacecraft */}
        {swarm.map((c, i) => {
          const p = pos[c.id];
          const x = p.x, y = p.y, a = p.a;
          const f = frames[c.id];
          const col = modeColor(f?.mode);
          const isSel = selected === c.id;
          const nFaults = popcount(f?.faults ?? 0);
          const scale = 0.85 + 0.3 * ((Math.sin(a) + 1) / 2);
          const sunlit = f?.energy?.sunlit ?? true;

          return (
            <g key={c.id} transform={`translate(${x} ${y})`}
               onClick={() => onSelect(c.id)} style={{ cursor: "pointer" }}>
              {/* selection / emergency halo */}
              {(isSel || (f && ["EMERGENCY", "SAFE"].includes(f.mode))) && (
                <circle r={16 * scale} fill="none" stroke={col} strokeWidth="1"
                        opacity={0.7} strokeDasharray={isSel ? "0" : "3 3"}>
                  <animate attributeName="r" values={`${13 * scale};${19 * scale};${13 * scale}`}
                           dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values=".8;.25;.8" dur="1.8s" repeatCount="indefinite" />
                </circle>
              )}
              {/* craft body */}
              <g transform={`scale(${scale})`}>
                <rect x={-5} y={-5} width={10} height={10} rx={2.5}
                      fill="#0d1322" stroke={col} strokeWidth="1.8"
                      style={{ filter: `drop-shadow(0 0 5px ${col})` }} />
                {/* solar panels — glow gold when in sunlight (charging) */}
                <rect x={-13} y={-2.5} width={6} height={5} rx={1}
                      fill={sunlit ? "#fcd34d" : col} opacity={sunlit ? 0.9 : 0.4}
                      style={sunlit ? { filter: "drop-shadow(0 0 3px #fcd34d)" } : undefined} />
                <rect x={7}   y={-2.5} width={6} height={5} rx={1}
                      fill={sunlit ? "#fcd34d" : col} opacity={sunlit ? 0.9 : 0.4}
                      style={sunlit ? { filter: "drop-shadow(0 0 3px #fcd34d)" } : undefined} />
              </g>
              {/* label */}
              <text x={0} y={-16 * scale - 4} textAnchor="middle" fill={col}
                    fontSize="10" fontWeight="700"
                    fontFamily="JetBrains Mono, monospace">{c.id}</text>
              {nFaults > 0 && (
                <g transform={`translate(${10 * scale} ${-12 * scale})`}>
                  <circle r={6.5} fill="#f87171" />
                  <text y={3} textAnchor="middle" fill="#05080f" fontSize="9"
                        fontWeight="800" fontFamily="JetBrains Mono">{nFaults}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* hover legend */}
      <div className="absolute bottom-2 left-3 flex gap-4 text-[9px] font-mono text-muted">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-ok" />Healthy</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warn" />Warning</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-crit" />Emergency</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-info" />Recovering</span>
      </div>

      {/* selected craft mini-readout */}
      {(() => {
        const f = frames[selected];
        if (!f) return null;
        const mode = modeWords(f.mode);
        const faults = faultList(f.faults);
        return (
          <div className="absolute top-2 right-3 text-right font-mono">
            <div className="text-[13px] font-bold text-slate-100">{selected}</div>
            <div className={
              mode.tone === "ok" ? "text-ok text-[11px]" :
              mode.tone === "crit" ? "text-crit text-[11px]" :
              mode.tone === "warn" ? "text-warn text-[11px]" : "text-info text-[11px]"
            }>{mode.label}</div>
            {faults.slice(0, 2).map(x => (
              <div key={x} className="text-[9px] text-crit">⚠ {x}</div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
