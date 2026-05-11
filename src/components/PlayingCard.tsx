"use client";

import { memo } from "react";
import { cn } from "@/lib/cn";
import { isRed, type Card, SUIT_NAME } from "@/lib/cards";

const SUIT_TO_ART: Record<Card["s"], string> = {
  s: "SPADE",
  h: "HEART",
  d: "DIAMOND",
  c: "CLUB",
};

function rankToArtRank(rank: Card["r"]): string {
  if (rank === "A") return "1";
  if (rank === "T") return "10";
  if (rank === "J") return "11-JACK";
  if (rank === "Q") return "12-QUEEN";
  if (rank === "K") return "13-KING";
  return rank;
}

function faceCardSrc(card: Card): string {
  return `/card-art/standard-bordered/${SUIT_TO_ART[card.s]}-${rankToArtRank(card.r)}.svg`;
}

interface Props {
  card?: Card | null;
  size?: number;
  faceDown?: boolean;
  className?: string;
  priority?: boolean;
}

function PlayingCardImpl({ card, size = 76, faceDown = false, className, priority = false }: Props) {
  if (faceDown || !card) {
    return (
      <div
        className={cn("card facedown", className)}
        style={{ ["--cw" as string]: `${size}px` }}
      />
    );
  }
  const red = isRed(card.s);
  const rank = card.r === "T" ? "10" : card.r;
  const src = faceCardSrc(card);
  const loading = priority ? "eager" : "lazy";

  return (
    <div
      className={cn("card", red ? "red" : "black", className)}
      style={{ ["--cw" as string]: `${size}px` }}
      data-suit={card.s}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Local SVG card faces avoid Next image optimization and its client runtime. */}
      <img
        src={src}
        alt={`${rank} ${SUIT_NAME[card.s]} of playing card`}
        className="card-face-art"
        loading={loading}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        draggable={false}
      />
    </div>
  );
}

export const PlayingCard = memo(
  PlayingCardImpl,
  (prev, next) =>
    prev.card?.key === next.card?.key &&
    prev.size === next.size &&
    prev.faceDown === next.faceDown &&
    prev.className === next.className &&
    prev.priority === next.priority,
);

PlayingCard.displayName = "PlayingCard";
