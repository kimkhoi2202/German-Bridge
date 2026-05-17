"use client";

import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { Button } from "@/components/base/buttons/button";
import { useGameViewportLock } from "../useGameViewportLock";

export default function PlayIndexPage() {
  return (
    <AuthGate>
      <PlayIndexContent />
    </AuthGate>
  );
}

function PlayIndexContent() {
  const router = useRouter();
  useGameViewportLock();

  return (
    <div className="gb-play-screen gb-route-fallback">
      <div className="eyebrow">Choose a private room</div>
      <Button size="md" onClick={() => router.push("/")}>
        Back to lobby
      </Button>
    </div>
  );
}
