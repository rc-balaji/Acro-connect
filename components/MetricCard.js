"use client";

import Sparkline from "./Sparkline";

export default function MetricCard({ icon, label, value, unit, hint, history = [], accent = "green" }) {
  const accentClass = {
    green: "text-emerald-300 bg-emerald-400/10 border-emerald-300/10",
    blue: "text-sky-300 bg-sky-400/10 border-sky-300/10",
    amber: "text-amber-300 bg-amber-400/10 border-amber-300/10",
    rose: "text-rose-300 bg-rose-400/10 border-rose-300/10"
  }[accent] || "text-emerald-300 bg-emerald-400/10 border-emerald-300/10";

  return (
    <div className="glass rounded-3xl p-5 min-h-[210px] overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-emerald-50/45">{label}</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-4xl font-semibold tracking-tight">{value}</span>
            <span className="pb-1.5 text-sm text-emerald-50/45">{unit}</span>
          </div>
        </div>
        <div className={`h-11 w-11 rounded-2xl border grid place-items-center ${accentClass}`}>{icon}</div>
      </div>
      <p className="mt-3 text-xs text-emerald-50/38">{hint}</p>
      <div className="mt-3 text-emerald-400/80">
        <Sparkline values={history} />
      </div>
    </div>
  );
}
