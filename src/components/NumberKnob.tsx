"use client";

import { cn } from "@/lib/cn";

interface Props {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
  hint?: string;
  className?: string;
}

export function NumberKnob({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
  hint,
  className,
}: Props) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-4 rounded-2xl border border-white/10 bg-white/5",
        className,
      )}
    >
      {(label || hint) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && <span className="eyebrow !text-[var(--color-brass)]">{label}</span>}
          {hint && <span className="text-[11px] italic text-[var(--color-accent-bad)]">{hint}</span>}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={dec}
          disabled={atMin}
          className="w-9 h-9 rounded-[10px] border border-white/15 bg-white/5 text-[var(--color-cream)] text-xl font-semibold grid place-items-center disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-[var(--color-brass)] hover:enabled:text-[var(--color-rail-edge)] hover:enabled:border-[var(--color-brass)] transition"
          aria-label={`Decrease ${label ?? ""}`}
        >
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="flex-1 min-w-0 h-9 px-3 rounded-[10px] border border-white/15 bg-black/25 text-[var(--color-cream)] text-lg text-center outline-none focus:border-[var(--color-brass)] focus:outline-2 focus:outline-[var(--color-brass)] mono"
          style={{ appearance: "textfield" }}
        />
        {suffix && (
          <span className="mono text-[11px] opacity-65 whitespace-nowrap">{suffix}</span>
        )}
        <button
          type="button"
          onClick={inc}
          disabled={atMax}
          className="w-9 h-9 rounded-[10px] border border-white/15 bg-white/5 text-[var(--color-cream)] text-xl font-semibold grid place-items-center disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-[var(--color-brass)] hover:enabled:text-[var(--color-rail-edge)] hover:enabled:border-[var(--color-brass)] transition"
          aria-label={`Increase ${label ?? ""}`}
        >
          +
        </button>
      </div>
      <div className="mono text-[10.5px] opacity-50 uppercase tracking-wider">
        {min}–{max}
      </div>
    </div>
  );
}
