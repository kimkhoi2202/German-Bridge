"use client";

import { MotionConfig } from "motion/react";
import { useSettings } from "@/store/settings";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const animations = useSettings((s) => s.animations);
  return (
    <MotionConfig reducedMotion={animations ? "user" : "always"}>
      {children}
    </MotionConfig>
  );
}
