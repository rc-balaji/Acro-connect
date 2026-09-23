"use client";

export default function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative h-8 w-14 rounded-full border transition-all duration-200 ${
        checked
          ? "bg-emerald-400 border-emerald-300/70 shadow-[0_0_25px_rgba(52,211,153,.18)]"
          : "bg-white/5 border-white/10"
      } ${disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer"}`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all duration-200 ${
          checked ? "left-7" : "left-1"
        }`}
      />
    </button>
  );
}
