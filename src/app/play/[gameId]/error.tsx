"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/base/buttons/button";

export default function LiveGameError() {
  const router = useRouter();

  return (
    <div className="gb-play-screen gb-route-fallback">
      <div className="eyebrow">Room unavailable</div>
      <Button size="md" type="button" onClick={() => router.push("/")}>
        Back to lobby
      </Button>
    </div>
  );
}
