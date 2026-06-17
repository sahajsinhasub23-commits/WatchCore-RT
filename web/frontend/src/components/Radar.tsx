import type { RtosFrame } from "@/lib/types";

/* ============================================================
 * Radar — 7-sensor stress spider chart.
 * Each axis is one onboard sensor, normalized 0 (nominal) to
 * 1 (at its fault threshold). The outer ring therefore IS the
 * fault boundary: any vertex touching it means a fault fires.
 * ============================================================ */

const SIZE = 250;
const C = SIZE / 2;
const R = 92;

const clamp = (v: number) => Math.max(0.02, Math.min(1.15, v));

const AXES = [
  { label: "TEMP",  norm: (s: RtosFrame["sensors"]) => clamp((s.temperature - 25) / 60) },
  { label: "BATT",  norm: (s: RtosFrame["sensors"]) => clamp((80 - s.battery) / 65) },
  { label: "RAD",   norm: (s: RtosFrame["sensors"]) => clamp((s.radiation - 10) / 90) },
  { label: "SOLAR", norm: (s: RtosFrame["sensors"]) => clamp((2.5 - s.solar) / 2.0) },
  { label: "ATT",   norm: (s: RtosFrame["sensors"]) => clamp((s.attitude - 1) / 9) },
  { label: "PRESS", norm: (s: RtosFrame["sensors"]) => clamp(Math.abs(s.pressure - 160) / 140) },
  { label: "COMM",  norm: (s: RtosFrame["sensors"]) => clamp((-60 - s.comm) / 30) },
];

function vertex(i: number, frac: number): [number, number] {
  const a = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
  return [C + R * frac * Math.cos(a), C + R * frac * Math.sin(a)];
}

export default function Radar({ frame }: { frame?: RtosFrame }) {
  const rings = [0.25, 0.5, 0.75, 1];

  const values = frame ? AXES.map(a => a.norm(frame.sensors)) : AXES.map(() => 0.05);
  const maxStress = Math.max(...values);
  const danger = maxStress >= 1;
  const fillColor = danger ? "rgba(251,111,146,.25)" : "rgba(129,140,248,.20)";
  const lineColor = danger ? "#fb6f92" : "#818cf8";

  const poly = values.map((v, i) => vertex(i, Math.min(v, 1.1)).join(",")).join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[280px] h-auto">
        {/* concentric rings; the outer one is the fault boundary */}
        {rings.map((f, ri) => (
          <polygon key={ri}
            points={AXES.map((_, i) => vertex(i, f).join(",")).join(" ")}
            fill="none"
            stroke={f === 1 ? "rgba(251,111,146,.45)" : "#2f3766"}
            strokeWidth={f === 1 ? 1.4 : 1}
            strokeDasharray={f === 1 ? "4 3" : "0"} />
        ))}
        {/* spokes */}
        {AXES.map((_, i) => {
          const [x, y] = vertex(i, 1);
          return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#2f3766" strokeWidth="1" />;
        })}
        {/* value polygon */}
        <polygon points={poly} fill={fillColor} stroke={lineColor} strokeWidth="2"
                 strokeLinejoin="round"
                 style={{ filter: `drop-shadow(0 0 8px ${lineColor})`, transition: "all .4s ease" }} />
        {/* vertices */}
        {values.map((v, i) => {
          const [x, y] = vertex(i, Math.min(v, 1.1));
          const hot = v >= 1;
          return (
            <circle key={i} cx={x} cy={y} r={hot ? 4 : 2.6}
                    fill={hot ? "#f87171" : lineColor}
                    style={hot ? { filter: "drop-shadow(0 0 6px #f87171)" } : undefined}>
              {hot && <animate attributeName="r" values="3;5;3" dur="1s" repeatCount="indefinite" />}
            </circle>
          );
        })}
        {/* axis labels */}
        {AXES.map((a, i) => {
          const [x, y] = vertex(i, 1.24);
          const v = values[i];
          return (
            <text key={i} x={x} y={y + 3} textAnchor="middle"
                  fill={v >= 1 ? "#f87171" : v >= 0.7 ? "#fbbf24" : "#7d8eaa"}
                  fontSize="9" fontWeight="700"
                  fontFamily="JetBrains Mono, monospace">{a.label}</text>
          );
        })}
      </svg>
      <div className="text-[9px] font-mono text-muted -mt-1">
        outer ring = fault threshold · vertex touching it triggers a fault
      </div>
    </div>
  );
}
