"use client";

import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { useSettings } from "@/store/settings";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const animations = useSettings((s) => s.animations);

  useEffect(() => {
    document.documentElement.dataset.motion = animations ? "on" : "off";
  }, [animations]);

  return (
    <MotionConfig reducedMotion={animations ? "user" : "always"}>
      {children}
    </MotionConfig>
  );
}
