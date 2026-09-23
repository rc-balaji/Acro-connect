"use client";

export default function Sparkline({ values = [], height = 74 }) {
  const cleaned = values.map(Number).filter(Number.isFinite);
  if (cleaned.length < 2) {
    return <div className="h-[74px] grid place-items-center text-xs text-emerald-100/35">Waiting for data…</div>;
  }

  const width = 320;
  const min = Math.min(...cleaned);
  const max = Math.max(...cleaned);
  const span = Math.max(max - min, 1);
  const points = cleaned
    .map((v, i) => {
      const x = (i / (cleaned.length - 1)) * width;
      const y = height - 8 - ((v - min) / span) * (height - 16);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="text-emerald-400"
      />
    </svg>
  );
}
