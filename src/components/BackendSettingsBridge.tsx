"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { useSettings } from "@/store/settings";

export function BackendSettingsBridge() {
  const { isAuthenticated } = useConvexAuth();
  const settings = useQuery(api.settings.get, isAuthenticated ? {} : "skip");
  const set = useSettings((s) => s.set);

  useEffect(() => {
    if (!isAuthenticated || typeof localStorage === "undefined") return;
    localStorage.removeItem("gb-match");
    localStorage.removeItem("gb-settings");
  }, [isAuthenticated]);

  useEffect(() => {
    if (!settings) return;
    set("theme", settings.theme);
    set("cardBack", settings.cardBack);
    set("layout", settings.layout);
    set("showTrumpHints", settings.showTrumpHints);
    set("animations", settings.animations);
    set("defaultPlayers", settings.defaultPlayers);
    set("defaultDecks", settings.defaultDecks);
    set("defaultTricksPerHand", settings.defaultTricksPerHand);
    set("defaultBotMood", settings.defaultBotMood);
  }, [settings, set]);

  return null;
}
