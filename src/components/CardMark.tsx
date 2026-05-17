"use client";

import { memo } from "react";
import { cn } from "@/lib/cn";
import { isRed, SUIT_NAME, type Card, type Rank, type Suit } from "@/lib/cards";

const SPRITE = "/card-art/marks/numbers-pips.svg";

type MarkSize = "xs" | "sm" | "md" | "lg" | "xl";

interface MarkSource {
  ids: string[];
  viewBox: string;
  aspect: number;
}

const RANK_MARKS: Record<Rank, MarkSource> = {
  A: { ids: ["path41-80"], viewBox: "-6 114 28 40", aspect: 0.7 },
  "2": { ids: ["path15-9"], viewBox: "68 114 27 40", aspect: 0.675 },
  "3": { ids: ["path17-3"], viewBox: "141 114 28 40", aspect: 0.7 },
  "4": { ids: ["path19-0"], viewBox: "216 114 27 40", aspect: 0.675 },
  "5": { ids: ["path21-2"], viewBox: "288 114 28 40", aspect: 0.7 },
  "6": { ids: ["path23-2"], viewBox: "361 114 29 40", aspect: 0.725 },
  "7": { ids: ["path25-3"], viewBox: "436 114 28 40", aspect: 0.7 },
  "8": { ids: ["path27-3"], viewBox: "509 114 28 40", aspect: 0.7 },
  "9": { ids: ["path29-2"], viewBox: "583 114 28 40", aspect: 0.7 },
  T: { ids: ["path31-0", "path33-3"], viewBox: "1036 520 25 38", aspect: 0.66 },
  J: { ids: ["path35-0"], viewBox: "730 114 27 40", aspect: 0.675 },
  Q: { ids: ["path37-9"], viewBox: "803 114 28 40", aspect: 0.7 },
  K: { ids: ["path39-5"], viewBox: "877 114 28 40", aspect: 0.7 },
};

const SUIT_MARKS: Record<Suit, MarkSource> = {
  c: { ids: ["path1245"], viewBox: "648 160 24 25", aspect: 0.96 },
  h: { ids: ["path1229"], viewBox: "736 160 25 25", aspect: 1 },
  s: { ids: ["path1233"], viewBox: "825 160 24 25", aspect: 0.96 },
  d: { ids: ["path1237"], viewBox: "916 160 20 25", aspect: 0.8 },
};

function rankLabel(rank: Rank): string {
  return rank === "T" ? "10" : rank;
}

function MarkSvg({
  source,
  className,
}: {
  source: MarkSource;
  className: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn("gb-card-mark-svg", className)}
      focusable="false"
      viewBox={source.viewBox}
      style={{ ["--mark-aspect" as string]: source.aspect }}
    >
      {source.ids.map((id) => (
        <use key={id} href={`${SPRITE}#${id}`} />
      ))}
    </svg>
  );
}

function CardMarkImpl({
  card,
  className,
  size = "md",
  showRank = true,
}: {
  card: Pick<Card, "r" | "s">;
  className?: string;
  size?: MarkSize;
  showRank?: boolean;
}) {
  const red = isRed(card.s);
  const label = `${rankLabel(card.r)} of ${SUIT_NAME[card.s]}`;

  return (
    <span
      className={cn("gb-card-mark", `size-${size}`, red ? "red" : "black", className)}
      aria-label={label}
      role="img"
    >
      {showRank && <MarkSvg source={RANK_MARKS[card.r]} className="gb-card-rank-svg" />}
      <MarkSvg source={SUIT_MARKS[card.s]} className="gb-card-suit-svg" />
    </span>
  );
}

export const CardMark = memo(CardMarkImpl);

CardMark.displayName = "CardMark";
