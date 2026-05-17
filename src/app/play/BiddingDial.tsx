"use client";

import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { useMatch } from "@/store/match";
import { lastBidderRestriction, type GameState } from "@/lib/game";
import { handEquity } from "@/lib/bot";
import { stateTransition } from "@/lib/uiMotion";
import { CardMark } from "@/components/CardMark";
import { Button } from "@/components/base/buttons/button";
import { SUIT_NAME } from "@/lib/cards";

interface BiddingDialProps {
  variant?: "overlay" | "panel";
  state?: GameState | null;
  onBid?: (value: number) => void;
  viewerIdx?: number;
}

export function BiddingDial({
  variant = "overlay",
  state: stateProp,
  onBid,
  viewerIdx = 0,
}: BiddingDialProps) {
  const localState = useMatch((s) => s.state);
  const localPlaceBid = useMatch((s) => s.bid);
  const state = stateProp ?? localState;
  const titleId = useId();

  const isBidding = !!state && state.phase === "bidding";
  const yourTurn =
    isBidding &&
    state.bidTurn === viewerIdx &&
    state.players[viewerIdx]?.isHuman === true;
  const canBid = yourTurn;
  const isPanel = variant === "panel";

  const trumpSuit = state?.trumpCard?.s ?? null;
  const hint = state && state.hands[0]
    ? Math.round(handEquity(state.hands[0], trumpSuit))
    : null;
  const placedBids = state ? state.bids.filter((b): b is number => b != null) : [];
  const placedCount = placedBids.length;
  const placedBidTotal = state ? placedBids.reduce((acc, bid) => acc + bid, 0) : 0;
  const isLastBidder = isBidding && state ? placedCount === state.players.length - 1 : false;
  const restricted =
    isLastBidder && state ? lastBidderRestriction(state.bids, state.tricksTotal) : null;
  const tricksTotal = state?.tricksTotal ?? 0;

  const [v, setV] = useState(0);
  useEffect(() => {
    if (isBidding && tricksTotal) {
      const preferred = Math.min(hint ?? 1, tricksTotal);
      if (preferred !== restricted) {
        setV(preferred);
        return;
      }
      const fallback = Array.from({ length: tricksTotal + 1 }, (_, i) => i)
        .find((n) => n !== restricted);
      setV(fallback ?? 0);
    }
  }, [hint, restricted, isBidding, state?.round, tricksTotal]);

  if (!state || !isBidding) return null;

  const opts = Array.from({ length: state.tricksTotal + 1 }, (_, i) => i);
  const submitDisabled = restricted === v;

  return (
    <div
      className={"gb-bid-overlay" + (isPanel ? " gb-bid-panel" : "")}
      role="region"
      aria-label="Bidding controls"
      aria-live="polite"
      aria-labelledby={titleId}
    >
      <motion.div
        className="gb-bid-card"
        initial={{ opacity: 0, transform: "translateY(18px) scale(0.98)" }}
        animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
        transition={stateTransition}
      >
        <div className="gb-bid-head">
          <div className="gb-bid-titleblock">
            <h2 id={titleId} className="gb-bid-title">
              Bid
            </h2>
          </div>
          {state.trumpCard && (
            <div className="gb-bid-trump-inline" aria-label={`Trump is ${SUIT_NAME[state.trumpCard.s]}`}>
              <span>Trump</span>
              <CardMark card={state.trumpCard} size="xs" />
            </div>
          )}
          <div className="gb-bid-context">
            <span className="gb-bid-meta-chip mono">
              {placedBidTotal} bid / {state.tricksTotal} total
            </span>
          </div>
        </div>

        <div className="gb-bid-numbers">
          {opts.map((n) => {
            const isRestricted = restricted === n;
            const isOn = v === n;
            return (
              <button
                type="button"
                key={n}
                disabled={isRestricted || !canBid}
                title={isRestricted ? "Total can't equal tricks" : ""}
                aria-label={
                  isRestricted
                    ? `Bid ${n} unavailable; total cannot equal tricks`
                    : `Bid ${n}`
                }
                aria-pressed={isOn}
                onClick={() => {
                  if (!isRestricted && canBid) {
                    setV(n);
                  }
                }}
                className={
                  "gb-bid-num" + (isOn ? " on" : "") + (isRestricted ? " restricted" : "")
                }
              >
                <span>{n}</span>
                {isRestricted && (
                  <span className="gb-bid-tooltip" aria-hidden="true">
                    Total cannot equal tricks
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="gb-bid-foot">
          {!canBid && (
            <div className="gb-bid-equity">
              <span className="gb-bid-wait">Waiting for your turn</span>
            </div>
          )}
          <Button
            type="button"
            className="gb-bid-submit"
            size="lg"
            isDisabled={submitDisabled || !canBid}
            title={submitDisabled ? "Total can't equal tricks" : ""}
            onClick={() => {
              if (!submitDisabled && canBid) {
                if (onBid) onBid(v);
                else localPlaceBid(0, v);
              }
            }}
          >
            Place bid
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
