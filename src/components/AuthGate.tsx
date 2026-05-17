"use client";

import { useConvexAuth } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

function SessionLoadingScreen() {
  return (
    <div className="gb-play-screen gb-route-fallback gb-session-screen" role="status" aria-live="polite">
      <div className="gb-session-shell">
        <div className="gb-session-brand" aria-label="German Bridge">
          <div className="gb-wordmark-rule" aria-hidden="true" />
          <div className="gb-lobby-h1">
            <span>German</span>
            <span>Bridge</span>
          </div>
        </div>

        <div className="gb-session-cards" aria-hidden="true">
          <span className="gb-session-card card-1" />
          <span className="gb-session-card card-2" />
          <span className="gb-session-card card-3" />
        </div>

        <div className="gb-session-copy">
          <div className="eyebrow">Private table</div>
          <div className="gb-session-title">Taking your seat</div>
          <div className="gb-session-status">Checking session</div>
        </div>

        <div className="gb-session-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    const target =
      typeof window === "undefined"
        ? pathname
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    router.replace(`/sign-in?redirect=${encodeURIComponent(target || "/")}`);
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading || !isAuthenticated) {
    return <SessionLoadingScreen />;
  }

  return <>{children}</>;
}
