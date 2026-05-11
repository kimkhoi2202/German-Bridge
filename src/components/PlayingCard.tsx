"use client";

import Image from "next/image";
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
}

export function PlayingCard({ card, size = 76, faceDown = false, className }: Props) {
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

  return (
    <div
      className={cn("card", red ? "red" : "black", className)}
      style={{ ["--cw" as string]: `${size}px` }}
      data-suit={card.s}
    >
      <Image
        src={src}
        alt={`${rank} ${SUIT_NAME[card.s]} of playing card`}
        className="card-face-art"
        fill
        unoptimized
        sizes={`${size}px`}
      />
    </div>
  );
}
