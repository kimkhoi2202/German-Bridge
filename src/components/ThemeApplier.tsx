"use client";

import { useEffect } from "react";
import { useSettings } from "@/store/settings";

export function ThemeApplier() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return null;
}
