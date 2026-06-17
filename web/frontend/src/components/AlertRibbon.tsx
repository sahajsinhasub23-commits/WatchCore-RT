import { AlertTriangle, ShieldAlert } from "lucide-react";
import { store } from "@/lib/store";
import { faultList } from "@/lib/plain";

/* ============================================================
 * AlertRibbon — fleet-wide red-alert strip. Appears under the
 * header whenever any craft is in EMERGENCY or SAFE mode, with
 * a matching screen-edge vignette. Disappears when clear.
 * ============================================================ */

export default function AlertRibbon() {
  const swarm  = store.use(s => s.swarm);
  const frames = store.use(s => s.frames);

  const alerts = swarm
    .map(c => ({ id: c.id, f: frames[c.id] }))
    .filter(x => x.f && (x.f.mode === "EMERGENCY" || x.f.mode === "SAFE"))
    .map(x => ({
      id: x.id,
      mode: x.f!.mode,
      faults: faultList(x.f!.faults),
    }));

  if (alerts.length === 0) return null;

  const anySafe = alerts.some(a => a.mode === "SAFE");

  return (
    <>
      <div className="alert-vignette" />
      <div className={
        "animate-slideDown border-b px-6 py-2 flex items-center gap-4 font-mono text-[12px] " +
        (anySafe
          ? "bg-orange-500/15 border-orange-400/40 text-orange-300"
          : "bg-crit/15 border-crit/40 text-crit")
      }>
        {anySafe ? <ShieldAlert size={15} className="animate-pulse2" /> : <AlertTriangle size={15} className="animate-pulse2" />}
        <span className="font-bold tracking-[0.2em]">{anySafe ? "SAFE MODE" : "EMERGENCY"}</span>
        <div className="flex gap-5 overflow-x-auto">
          {alerts.map(a => (
            <span key={a.id} className="whitespace-nowrap">
              <b>{a.id}</b>
              {" — "}
              {a.faults.length ? a.faults.join(", ") : a.mode === "SAFE" ? "locked down" : "handling fault"}
            </span>
          ))}
        </div>
        <span className="ml-auto text-[10px] opacity-70 whitespace-nowrap">autonomous recovery in progress</span>
      </div>
    </>
  );
}
