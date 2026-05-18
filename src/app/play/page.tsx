"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
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
  const rooms = useQuery(api.rooms.listMine);
  const activeGame = (rooms ?? [])
    .filter((room) => room.status === "active")
    .sort(
      (a, b) =>
        (b.startedAt ?? b.updatedAt ?? b.createdAt) -
        (a.startedAt ?? a.updatedAt ?? a.createdAt),
    )[0];
  const activeGameId = activeGame?._id;
  useGameViewportLock();

  useEffect(() => {
    if (activeGameId) router.replace(`/play/${activeGameId}`);
  }, [activeGameId, router]);

  if (activeGameId) {
    return <div className="gb-play-screen gb-route-fallback" />;
  }

  return (
    <div className="gb-play-screen gb-route-fallback">
      <Button size="md" onClick={() => router.push("/")}>
        Back to lobby
      </Button>
    </div>
  );
}
