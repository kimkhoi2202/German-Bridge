"use client";

import Link from "next/link";
import { LayoutGroup, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { useMatch } from "@/store/match";

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

export function BottomNav() {
  const pathname = usePathname();
  const matchActive = useMatch((s) => s.state != null);

  const activeRoute =
    ROUTES.find((r) =>
      r.href === "/" ? pathname === "/" : pathname?.startsWith(r.href),
    ) ?? ROUTES[0];

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <LayoutGroup id="bottom-nav">
        <div className="routes" data-current={activeRoute.id}>
          {ROUTES.map((r) => {
            const active =
              r.href === "/" ? pathname === "/" : pathname?.startsWith(r.href);
            const badge = r.id === "play" && matchActive ? "Live" : undefined;
            const ariaLabel = badge ? `${r.label}, live match` : r.label;
            return (
              <Link
                key={r.href}
                href={r.href}
                className="bn-item"
                data-route={r.id}
                data-active={active ? "1" : "0"}
                data-live={badge ? "1" : "0"}
                title={ariaLabel}
                aria-label={ariaLabel}
                aria-current={active ? "page" : undefined}
                prefetch={false}
              >
                {active && (
                  <motion.span
                    layoutId="bottom-nav-active"
                    className="bn-active-bg"
                    transition={{ type: "spring", duration: 0.24, bounce: 0 }}
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
              </Link>
            );
          })}
        </div>
      </LayoutGroup>
    </nav>
  );
}
