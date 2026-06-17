import { CheckCircle2, AlertTriangle, ShieldAlert, Info, X } from "lucide-react";
import { store, dismissToast } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Toast } from "@/lib/types";

/* ============================================================
 * Toasts — small pill notifications in the bottom-right corner.
 * An "event" pill appears when a problem starts; a "fixed" pill
 * (with a short note on HOW it was fixed) appears when the craft
 * stabilizes. They slide in, then auto-dismiss after a few
 * seconds (handled by the store).
 * ============================================================ */

const STYLE: Record<Toast["kind"], {
  ring: string; icon: JSX.Element; accent: string;
}> = {
  event: {
    ring: "border-crit/50",
    accent: "text-crit",
    icon: <AlertTriangle size={15} className="text-crit" />,
  },
  warn: {
    ring: "border-orange-400/50",
    accent: "text-orange-300",
    icon: <ShieldAlert size={15} className="text-orange-300" />,
  },
  fixed: {
    ring: "border-ok/50",
    accent: "text-ok",
    icon: <CheckCircle2 size={15} className="text-ok" />,
  },
  info: {
    ring: "border-accent/50",
    accent: "text-accent",
    icon: <Info size={15} className="text-accent" />,
  },
};

export default function Toasts() {
  const toasts = store.use(s => s.toasts);

  return (
    <div className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 w-[min(340px,calc(100vw-2rem))]">
      {toasts.map(t => {
        const st = STYLE[t.kind];
        return (
          <div key={t.id}
            className={cn(
              "animate-riseIn group relative flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
              "backdrop-blur-md bg-panel/90 shadow-glow overflow-hidden", st.ring)}>
            {/* left accent bar */}
            <span className={cn("absolute left-0 top-0 bottom-0 w-1",
              t.kind === "fixed" ? "bg-ok" : t.kind === "warn" ? "bg-orange-400"
              : t.kind === "event" ? "bg-crit" : "bg-accent")} />
            <div className="mt-0.5 shrink-0">{st.icon}</div>
            <div className="min-w-0 flex-1">
              <div className={cn("text-[12px] font-bold font-mono truncate", st.accent)}>
                {t.title}
              </div>
              <div className="text-[11px] text-slate-300 leading-snug">{t.detail}</div>
            </div>
            <button onClick={() => dismissToast(t.id)}
              className="shrink-0 text-muted hover:text-slate-100 transition opacity-0 group-hover:opacity-100">
              <X size={13} />
            </button>
            {/* countdown bar */}
            <span className={cn("absolute left-0 bottom-0 h-0.5 animate-[toastbar_6s_linear_forwards]",
              t.kind === "fixed" ? "bg-ok/60" : t.kind === "warn" ? "bg-orange-400/60"
              : t.kind === "event" ? "bg-crit/60" : "bg-accent/60")} />
          </div>
        );
      })}
    </div>
  );
}
