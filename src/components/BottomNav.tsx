"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { useMatch } from "@/store/match";
import { layoutTransition } from "@/lib/uiMotion";

interface Route {
  href: string;
  label: string;
  icon: string;
  id: "lobby" | "play" | "history" | "settings";
  badge?: string;
}

const ROUTES: Route[] = [
  { href: "/", label: "Lobby", icon: "home", id: "lobby" },
  { href: "/play", label: "Play", icon: "cards", id: "play" },
  { href: "/history", label: "History", icon: "history", id: "history" },
  { href: "/settings", label: "Settings", icon: "cog", id: "settings" },
];

const MotionLink = motion.create(Link);

export function BottomNav() {
  const pathname = usePathname();
  const matchActive = useMatch((s) => s.state != null);
  const [tooltipWarm, setTooltipWarm] = useState(false);
  const warmTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeRoute =
    ROUTES.find((r) =>
      r.href === "/" ? pathname === "/" : pathname?.startsWith(r.href),
    ) ?? ROUTES[0];

  useEffect(() => {
    return () => {
      if (warmTimeout.current) clearTimeout(warmTimeout.current);
    };
  }, []);

  const openTooltip = () => {
    if (warmTimeout.current) clearTimeout(warmTimeout.current);
    if (!tooltipWarm) {
      warmTimeout.current = setTimeout(() => setTooltipWarm(true), 240);
    }
  };

  const closeTooltip = () => {
    if (warmTimeout.current) clearTimeout(warmTimeout.current);
    warmTimeout.current = setTimeout(() => setTooltipWarm(false), 300);
  };

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <LayoutGroup id="bottom-nav">
        <motion.div
          layout
          transition={layoutTransition}
          className="routes"
          data-current={activeRoute.id}
          data-tooltip-warm={tooltipWarm ? "1" : "0"}
        >
          {ROUTES.map((r) => {
            const active =
              r.href === "/" ? pathname === "/" : pathname?.startsWith(r.href);
            const badge = r.id === "play" && matchActive ? "Live" : undefined;
            const ariaLabel = badge ? `${r.label}, live match` : r.label;
            const tooltipLabel = badge ? `${r.label} · Live` : r.label;
            return (
              <MotionLink
                layout
                transition={layoutTransition}
                key={r.href}
                href={r.href}
                className="bn-item"
                data-route={r.id}
                data-active={active ? "1" : "0"}
                data-live={badge ? "1" : "0"}
                aria-label={ariaLabel}
                aria-current={active ? "page" : undefined}
                prefetch={false}
                onPointerEnter={openTooltip}
                onPointerLeave={closeTooltip}
                onFocus={openTooltip}
                onBlur={closeTooltip}
              >
                {active && (
                  <motion.span
                    layoutId="bottom-nav-active"
                    className="bn-active-bg"
                    transition={layoutTransition}
                    aria-hidden="true"
                  />
                )}
                <span className="bn-icon" data-icon={r.icon}>
                  <Icon
                    name={r.icon}
                    size={r.icon === "cards" ? 23 : 19}
                    strokeWidth={r.icon === "cards" ? 0 : 1.65}
                  />
                </span>
                <span className="label">{r.label}</span>
                {badge && <span className="bn-live-dot" aria-hidden="true" />}
                <span className="bn-tooltip" aria-hidden="true">
                  {tooltipLabel}
                </span>
              </MotionLink>
            );
          })}
        </motion.div>
      </LayoutGroup>
    </nav>
  );
}
