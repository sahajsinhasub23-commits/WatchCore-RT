import { useEffect, useRef, useState } from "react";

/* ============================================================
 * Speedometer — animated 180° gauge with a sweeping needle,
 * tick marks, a colored value arc, and a smooth needle that
 * eases toward the live value.
 *
 * Geometry note: the dial occupies the TOP semicircle. Angles
 * run 180° (left) → 270° (top) → 360° (right). The swept angle
 * from the start to the needle is therefore always ≤ 180°, so
 * the arc's large-arc-flag is always 0.
 * ============================================================ */

interface Props {
  value: number;
  max?: number;
  label: string;
  unit?: string;
  gradient?: [string, string, string];
  color?: string;
}

const W = 168;
const H = 108;
const CX = W / 2;
const CY = 90;
const R = 70;

function polar(angleDeg: number, radius: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
}

export default function Speedometer({
  value, max = 100, label, unit = "", gradient, color,
}: Props) {
  const grad = gradient ?? ["#60a5fa", "#818cf8", "#a855f7"];
  const accent = color ?? grad[2];

  /* Target is held in a ref and read by ONE persistent rAF loop, so
   * frequent value updates (8 Hz telemetry) never restart the animation
   * — the needle just keeps easing toward whatever the latest value is. */
  const targetRef = useRef(0);
  targetRef.current = Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));

  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setShown(prev => {
        const t = targetRef.current;
        const diff = t - prev;
        if (Math.abs(diff) < 0.25) return t;     /* snap when close */
        return prev + diff * 0.28;               /* snappy easing */
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);                                         /* run once, never restart */

  const frac = Math.max(0, Math.min(1, shown / max));
  const angle = 180 + frac * 180;                /* 180° → 360° */

  const [nx, ny] = polar(angle, R - 12);         /* needle tip */
  const [sx, sy] = polar(180, R);                /* arc start (left) */
  const [ex, ey] = polar(angle, R);              /* arc end (needle) */
  const [bx, by] = polar(360, R);                /* track end (right) */

  /* swept angle is always ≤ 180°, so large-arc is always 0 */
  const valuePath = `M ${sx} ${sy} A ${R} ${R} 0 0 1 ${ex} ${ey}`;
  const trackPath = `M ${sx} ${sy} A ${R} ${R} 0 0 1 ${bx} ${by}`;

  const gid = `spd-${label.replace(/\s/g, "")}`;

  return (
    <div className="flex flex-col items-center w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[160px] overflow-visible">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={grad[0]} />
            <stop offset="50%" stopColor={grad[1]} />
            <stop offset="100%" stopColor={grad[2]} />
          </linearGradient>
          <filter id={`${gid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* background track (full top semicircle) */}
        <path d={trackPath} fill="none" stroke="#2f3766" strokeWidth={9} strokeLinecap="round" />

        {/* tick marks */}
        {Array.from({ length: 11 }, (_, i) => {
          const ta = 180 + (i / 10) * 180;
          const major = i % 5 === 0;
          const [x1, y1] = polar(ta, R + 6);
          const [x2, y2] = polar(ta, R + (major ? 13 : 10));
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={major ? "#9aa6cf" : "#4a5589"}
                  strokeWidth={major ? 1.6 : 1} />
          );
        })}

        {/* value arc (only when there is something to show) */}
        {frac > 0.012 && (
          <path d={valuePath} fill="none" stroke={`url(#${gid})`} strokeWidth={9}
                strokeLinecap="round" filter={`url(#${gid}-glow)`} />
        )}

        {/* needle */}
        <line x1={CX} y1={CY} x2={nx} y2={ny}
              stroke={accent} strokeWidth={2.6} strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${accent})` }} />
        <circle cx={CX} cy={CY} r={6} fill="#191e3e" stroke={accent} strokeWidth={2} />
        <circle cx={CX} cy={CY} r={2} fill={accent} />

        {/* readout */}
        <text x={CX} y={CY - 16} textAnchor="middle"
              fontFamily="JetBrains Mono, monospace" fontWeight="700"
              fontSize="22" fill={accent}>
          {Math.round(shown)}<tspan fontSize="10" fill="#9aa6cf">{unit}</tspan>
        </text>
      </svg>
      <div className="text-[10px] uppercase tracking-[0.18em] text-dim font-mono -mt-1">
        {label}
      </div>
    </div>
  );
}
