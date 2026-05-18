"use client";

import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { useMatch } from "@/store/match";
import { lastBidderRestriction, type GameState } from "@/lib/game";
import { stateTransition } from "@/lib/uiMotion";
import { CardMark } from "@/components/CardMark";
import { Button } from "@/components/base/buttons/button";
import { SUIT_NAME } from "@/lib/cards";

interface BiddingDialProps {
  variant?: "overlay" | "panel";
  state?: GameState | null;
  onBid?: (value: number) => void;
  viewerIdx?: number;
  isSubmitting?: boolean;
}

export function BiddingDial({
  variant = "overlay",
  state: stateProp,
  onBid,
  viewerIdx = 0,
  isSubmitting = false,
}: BiddingDialProps) {
  const localState = useMatch((s) => s.state);
  const localPlaceBid = useMatch((s) => s.bid);
  const state = stateProp ?? localState;
  const titleId = useId();

  const isBidding = !!state && state.phase === "bidding";
  const viewerIsHuman = isBidding && state.players[viewerIdx]?.isHuman === true;
  const yourTurn =
    isBidding &&
    state.bidTurn === viewerIdx &&
    viewerIsHuman;
  const canPrepareBid = viewerIsHuman && !isSubmitting;
  const isPanel = variant === "panel";

  const placedBids = state ? state.bids.filter((b): b is number => b != null) : [];
  const placedCount = placedBids.length;
  const placedBidTotal = state ? placedBids.reduce((acc, bid) => acc + bid, 0) : 0;
  const isLastBidder = isBidding && state ? placedCount === state.players.length - 1 : false;
  const restricted =
    isLastBidder && state ? lastBidderRestriction(state.bids, state.tricksTotal) : null;
  const bidKey = state ? `${state.round}:${state.trickIdx}:${viewerIdx}` : "";
  const viewerHasBid = state?.bids[viewerIdx] != null;
  const activeBidderName = state?.players[state.bidTurn]?.name ?? "another player";

  const [v, setV] = useState<number | null>(null);
  const [queuedBid, setQueuedBid] = useState<number | null>(null);
  const [submittedBidKey, setSubmittedBidKey] = useState<string | null>(null);

  useEffect(() => {
    setV(null);
    setQueuedBid(null);
    setSubmittedBidKey(null);
  }, [bidKey, isBidding]);

  useEffect(() => {
    if (
      !state ||
      !isBidding ||
      !yourTurn ||
      queuedBid == null ||
      isSubmitting ||
      submittedBidKey === bidKey ||
      viewerHasBid
    ) {
      return;
    }

    if (queuedBid < 0 || queuedBid > state.tricksTotal) {
      setQueuedBid(null);
      return;
    }
    if (restricted === queuedBid) {
      setQueuedBid(null);
      return;
    }

    setSubmittedBidKey(bidKey);
    if (onBid) onBid(queuedBid);
    else localPlaceBid(viewerIdx, queuedBid);
  }, [
    bidKey,
    isBidding,
    isSubmitting,
    localPlaceBid,
    onBid,
    queuedBid,
    restricted,
    state,
    submittedBidKey,
    viewerHasBid,
    viewerIdx,
    yourTurn,
  ]);

  if (!state || !isBidding || viewerHasBid || submittedBidKey === bidKey) return null;

  const opts = Array.from({ length: state.tricksTotal + 1 }, (_, i) => i);
  const submitDisabled = v == null || isSubmitting || (yourTurn && restricted === v);
  const submitTitle =
    yourTurn && restricted === v
      ? "Total bids can't equal total cards"
      : v == null
        ? "Choose a bid first"
        : "";
  const handleSubmitBid = () => {
    if (submitDisabled || v == null) return;
    if (!yourTurn) {
      setQueuedBid(v);
      return;
    }
    setSubmittedBidKey(bidKey);
    if (onBid) onBid(v);
    else localPlaceBid(viewerIdx, v);
  };
  const handlePickBid = (bid: number, isRestricted: boolean) => {
    if (isRestricted || !canPrepareBid) return;
    setV((current) => {
      const next = current === bid ? null : bid;
      if (!yourTurn && next == null && queuedBid === bid) setQueuedBid(null);
      return next;
    });
  };

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
              {yourTurn ? "Your bid" : `Waiting for ${activeBidderName}`}
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
              Total bids so far: {placedBidTotal}
            </span>
          </div>
        </div>

        {viewerIsHuman ? (
          <>
            {!yourTurn && (
              <div className="gb-bid-waiting gb-bid-preselect mono">
                <span>{activeBidderName} is choosing a bid.</span>
                <span>
                  {queuedBid == null ? "Your bid is coming up." : `Queued bid: ${queuedBid}`}
                </span>
              </div>
            )}
            <div className="gb-bid-numbers">
              {opts.map((n) => {
                const isRestricted = yourTurn && restricted === n;
                const isOn = v === n;
                return (
                  <button
                    type="button"
                    key={n}
                    disabled={isRestricted || !canPrepareBid}
                    title={isRestricted ? "Total bids can't equal total cards" : ""}
                    aria-label={
                      isRestricted
                        ? `Bid ${n} unavailable; total bids cannot equal total cards`
                        : `Bid ${n}`
                    }
                    aria-pressed={isOn}
                    onClick={() => handlePickBid(n, isRestricted)}
                    className={
                      "gb-bid-num" + (isOn ? " on" : "") + (isRestricted ? " restricted" : "")
                    }
                  >
                    <span>{n}</span>
                    {isRestricted && (
                      <span className="gb-bid-tooltip" aria-hidden="true">
                        Total bids cannot equal total cards
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="gb-bid-foot">
              <Button
                type="button"
                className="gb-bid-submit"
                size="lg"
                isDisabled={submitDisabled || !canPrepareBid}
                isLoading={isSubmitting}
                showTextWhileLoading
                title={submitTitle}
                onClick={handleSubmitBid}
              >
                Place bid
              </Button>
            </div>
          </>
        ) : (
          <div className="gb-bid-waiting mono">
            <span>{activeBidderName} is choosing a bid.</span>
            <span>Your bid is coming up.</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
