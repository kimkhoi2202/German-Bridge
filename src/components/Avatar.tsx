"use client";

import { cn } from "@/lib/cn";

const PALETTE: [string, string][] = [
  ["oklch(0.72 0.16 30)", "oklch(0.50 0.18 350)"],
  ["oklch(0.78 0.14 80)", "oklch(0.55 0.16 30)"],
  ["oklch(0.72 0.14 145)", "oklch(0.42 0.12 200)"],
  ["oklch(0.65 0.16 250)", "oklch(0.40 0.14 300)"],
  ["oklch(0.78 0.14 100)", "oklch(0.50 0.18 60)"],
  ["oklch(0.72 0.16 320)", "oklch(0.42 0.16 250)"],
  ["oklch(0.68 0.14 200)", "oklch(0.40 0.12 140)"],
  ["oklch(0.78 0.14 50)", "oklch(0.50 0.18 25)"],
  ["oklch(0.66 0.16 290)", "oklch(0.40 0.14 320)"],
  ["oklch(0.74 0.14 170)", "oklch(0.45 0.12 100)"],
  ["oklch(0.70 0.15 350)", "oklch(0.40 0.14 280)"],
  ["oklch(0.76 0.13 60)", "oklch(0.50 0.16 0)"],
];

export function Avatar({
  name = "?",
  seed = 0,
  size = 44,
  className,
}: {
  name?: string;
  seed?: number;
  size?: number;
  className?: string;
}) {
  const [c1, c2] = PALETTE[seed % PALETTE.length];
  const initials =
    name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <div
      className={cn(
        "inline-grid place-items-center rounded-full font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_2px_6px_rgba(0,0,0,.18)] flex-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.36),
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
      }}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
