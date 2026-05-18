"use client";

import Link from "next/link";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import { Icon } from "./Icon";

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

const NAV_PREFETCH_HREFS = ROUTES.map((route) => route.href);
const QUERY_PREWARM_MS = 60_000;
type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: Window["requestIdleCallback"];
  cancelIdleCallback?: Window["cancelIdleCallback"];
};

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const rooms = useQuery(api.rooms.listMine, isAuthenticated ? {} : "skip");
  const activeGame = (rooms ?? [])
    .filter((room) => room.status === "active")
    .sort(
      (a, b) =>
        (b.startedAt ?? b.updatedAt ?? b.createdAt) -
        (a.startedAt ?? a.updatedAt ?? a.createdAt),
    )[0];
  const liveGameHref = activeGame ? `/play/${activeGame._id}` : "/play";
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

  useEffect(() => {
    if (!isAuthenticated) return;

    const warmNav = () => {
      for (const href of NAV_PREFETCH_HREFS) router.prefetch(href);
      if (liveGameHref !== "/play") router.prefetch(liveGameHref);

      convex.prewarmQuery({
        query: api.profiles.me,
        args: {},
        extendSubscriptionFor: QUERY_PREWARM_MS,
      });
      convex.prewarmQuery({
        query: api.stats.mine,
        args: {},
        extendSubscriptionFor: QUERY_PREWARM_MS,
      });
      convex.prewarmQuery({
        query: api.games.history,
        args: {},
        extendSubscriptionFor: QUERY_PREWARM_MS,
      });
    };

    const idleWindow = window as IdleWindow;
    if (
      typeof idleWindow.requestIdleCallback === "function" &&
      typeof idleWindow.cancelIdleCallback === "function"
    ) {
      const idle = idleWindow.requestIdleCallback(warmNav, { timeout: 1_500 });
      return () => idleWindow.cancelIdleCallback?.(idle);
    }

    const timeout = window.setTimeout(warmNav, 250);
    return () => window.clearTimeout(timeout);
  }, [convex, isAuthenticated, liveGameHref, router]);

  if (!isAuthenticated || pathname?.startsWith("/sign-in")) return null;

  const openTooltip = () => {
    if (warmTimeout.current) clearTimeout(warmTimeout.current);
    if (!tooltipWarm) {
      warmTimeout.current = setTimeout(() => setTooltipWarm(true), 240);
    }
  };

  const prefetchRoute = (href: string) => {
    if (href !== pathname) router.prefetch(href);
  };

  const closeTooltip = () => {
    if (warmTimeout.current) clearTimeout(warmTimeout.current);
    warmTimeout.current = setTimeout(() => setTooltipWarm(false), 300);
  };

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <div
        className="routes"
        data-current={activeRoute.id}
        data-tooltip-warm={tooltipWarm ? "1" : "0"}
      >
        <span className="bn-active-bg" aria-hidden="true" />
        {ROUTES.map((r) => {
          const href = r.id === "play" ? liveGameHref : r.href;
          const active =
            r.href === "/" ? pathname === "/" : pathname?.startsWith(r.href);
          const badge = r.id === "play" && activeGame ? "Live" : undefined;
          const label = badge && active ? "Live" : r.label;
          const ariaLabel = badge ? `${r.label}, live match` : r.label;
          const tooltipLabel = badge ? `${r.label} · Live` : r.label;
          return (
            <Link
              key={r.href}
              href={href}
              className="bn-item"
              data-route={r.id}
              data-active={active ? "1" : "0"}
              data-live={badge ? "1" : "0"}
              aria-label={ariaLabel}
              aria-current={active ? "page" : undefined}
              prefetch
              onPointerEnter={() => {
                prefetchRoute(href);
                openTooltip();
              }}
              onPointerLeave={closeTooltip}
              onFocus={() => {
                prefetchRoute(href);
                openTooltip();
              }}
              onBlur={closeTooltip}
            >
              <span className="bn-icon" data-icon={r.icon}>
                <Icon
                  name={r.icon}
                  size={r.icon === "cards" ? 19 : 18}
                  strokeWidth={r.icon === "cards" ? 1.75 : 1.65}
                />
              </span>
              <span className="label">{label}</span>
              {badge && <span className="bn-live-dot" aria-hidden="true" />}
              <span className="bn-tooltip" aria-hidden="true">
                {tooltipLabel}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
