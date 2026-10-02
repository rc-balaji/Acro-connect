export default function MetricCard({ icon, label, value, unit, hint }) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-white/35">{label}</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-semibold tracking-tight">{value}</span>
            <span className="pb-1 text-sm text-white/45">{unit}</span>
          </div>
          <p className="mt-3 text-xs text-white/30">{hint}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-300/8 text-emerald-300">
          {icon}
        </div>
      </div>
    </div>
  );
}
