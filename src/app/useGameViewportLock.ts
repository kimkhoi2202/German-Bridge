"use client";

import { useLayoutEffect } from "react";

export function useGameViewportLock() {
  useLayoutEffect(() => {
    if (document.documentElement.classList.contains("gb-game-viewport")) return;
    document.documentElement.classList.add("gb-game-viewport");
    return () => {
      document.documentElement.classList.remove("gb-game-viewport");
    };
  }, []);
}
