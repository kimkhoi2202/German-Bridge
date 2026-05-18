"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AuthGate } from "@/components/AuthGate";
import type { Personality } from "@/lib/bot";
import type { Card } from "@/lib/cards";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/base/buttons/button";
import { formatHandLadder } from "@/lib/matchLabels";
import { TableView } from "../Table";
import { RoundSummary } from "../RoundSummary";
import { MatchEnd } from "../MatchEnd";
import { TrickBanner } from "../TrickBanner";
import { useGameViewportLock } from "../../useGameViewportLock";
import { useSettings } from "@/store/settings";
import {
  canKeepPreMoveIntent,
  canQueuePreMoveIntent,
  canSendPlayCardIntent,
} from "./playCardIntent";

const MOODS: { id: Personality; label: string }[] = [
  { id: "cautious", label: "Cautious" },
  { id: "mixed", label: "Mixed" },
  { id: "aggressive", label: "Aggressive" },
  { id: "champion", label: "Champion" },
  { id: "gpt", label: "GPT" },
];

export default function LiveGamePage() {
  return (
    <AuthGate>
      <LiveGameContent />
    </AuthGate>
  );
}

function LiveGameContent() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId as Id<"games">;
  const router = useRouter();
  const data = useQuery(api.games.watch, { gameId });
  const startRoom = useMutation(api.rooms.start);
  const claimSeat = useMutation(api.rooms.claimSeat);
  const endRoom = useMutation(api.rooms.end);
  const placeBid = useMutation(api.games.placeBid);
  const playCard = useMutation(api.games.playCard);
  const advanceRound = useMutation(api.games.advanceRound);
  const touchPresence = useMutation(api.games.touchPresence);
  const nudgeAutoTurn = useMutation(api.games.nudgeAutoTurn);
  const cardBack = useSettings((s) => s.cardBack);
  const layout = useSettings((s) => s.layout);
  const [botMood, setBotMood] = useState<Personality>("mixed");
  const [error, setError] = useState<string | null>(null);
  const [pendingBid, setPendingBid] = useState(false);
  const [pendingAdvance, setPendingAdvance] = useState(false);
  const [pendingPlayCardKey, setPendingPlayCardKey] = useState<string | null>(null);
  const [preMoveCardKey, setPreMoveCardKey] = useState<string | null>(null);
  const pendingBidSequenceRef = useRef<number | null>(null);
  const pendingAdvanceSequenceRef = useRef<number | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingPlaySequenceRef = useRef<number | null>(null);
  const autoTurnNudgeRef = useRef<string | null>(null);
  useGameViewportLock();

  useEffect(() => {
    void touchPresence({ gameId, status: "online" }).catch(() => {});
    const interval = window.setInterval(() => {
      void touchPresence({ gameId, status: "online" }).catch(() => {});
    }, 20_000);
    return () => {
      window.clearInterval(interval);
      void touchPresence({ gameId, status: "offline" }).catch(() => {});
    };
  }, [gameId, touchPresence]);

  useEffect(() => {
    if (data?.game.status === "setup" && data.game.defaultBotMood) {
      setBotMood(data.game.defaultBotMood);
    }
  }, [data?.game.defaultBotMood, data?.game.status]);

  useEffect(() => {
    if (!data || data.game.status !== "active" || !data.state) return;
    const state = data.state;
    const activePlayer =
      state.phase === "bidding"
        ? state.players[state.bidTurn]
        : state.phase === "playing" && state.trickWinner == null
          ? state.players[state.turnIdx]
          : null;
    const shouldNudge =
      state.phase === "dealing" ||
      state.phase === "trump" ||
      state.phase === "trick-end" ||
      (activePlayer?.isHuman === false && (state.phase === "bidding" || state.phase === "playing"));

    if (!shouldNudge) return;

    const nudgeKey = [
      data.game.sequence,
      state.phase,
      state.round,
      state.trickIdx,
      state.bidTurn,
      state.turnIdx,
      state.trickWinner ?? "none",
    ].join(":");
    if (autoTurnNudgeRef.current === nudgeKey) return;
    autoTurnNudgeRef.current = nudgeKey;

    const delay = state.phase === "bidding" || state.phase === "playing" ? 1600 : 2200;
    const timer = window.setTimeout(() => {
      void nudgeAutoTurn({ gameId }).catch(() => {});
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    data,
    gameId,
    nudgeAutoTurn,
  ]);

  useEffect(() => {
    if (!pendingBid) return;
    const sequenceAtClick = pendingBidSequenceRef.current;
    if (sequenceAtClick == null || data?.game.sequence !== sequenceAtClick) {
      pendingBidSequenceRef.current = null;
      setPendingBid(false);
    }
  }, [data?.game.sequence, pendingBid]);

  useEffect(() => {
    if (!pendingAdvance) return;
    const sequenceAtClick = pendingAdvanceSequenceRef.current;
    if (
      sequenceAtClick == null ||
      data?.game.sequence !== sequenceAtClick ||
      data?.state?.phase !== "round-end"
    ) {
      pendingAdvanceSequenceRef.current = null;
      setPendingAdvance(false);
    }
  }, [data?.game.sequence, data?.state?.phase, pendingAdvance]);

  useEffect(() => {
    if (!pendingPlayRef.current) return;
    const sequenceAtClick = pendingPlaySequenceRef.current;
    if (sequenceAtClick == null || data?.game.sequence !== sequenceAtClick) {
      pendingPlayRef.current = false;
      pendingPlaySequenceRef.current = null;
      setPendingPlayCardKey(null);
    }
  }, [data?.game.sequence]);

  const seats = useMemo(() => {
    if (!data) return [];
    const bySeat = new Map(data.participants.map((participant) => [participant.seatIdx, participant]));
    return Array.from({ length: data.game.playerCount }, (_, seatIdx) => bySeat.get(seatIdx) ?? null);
  }, [data]);
  const viewerParticipant = useMemo(() => {
    if (!data) return null;
    return data.participants.find((participant) => participant.seatIdx === data.viewerSeatIdx) ?? null;
  }, [data]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleBid(bid: number) {
    if (pendingBid || data?.state?.phase !== "bidding") return;
    pendingBidSequenceRef.current = data.game.sequence;
    setPendingBid(true);
    setError(null);

    try {
      await placeBid({ gameId, bid });
    } catch (err) {
      pendingBidSequenceRef.current = null;
      setPendingBid(false);
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  const handlePlayCard = useCallback(async (card: Card) => {
    if (
      !canSendPlayCardIntent({
        state: data?.state,
        legalCardKeys: data?.legalCardKeys,
        card,
        isPlayInFlight: pendingPlayRef.current,
      })
    ) {
      return;
    }

    pendingPlayRef.current = true;
    pendingPlaySequenceRef.current = data?.game.sequence ?? null;
    setPendingPlayCardKey(card.key);
    setError(null);

    try {
      setPreMoveCardKey(null);
      await playCard({ gameId, cardKey: card.key });
    } catch (err) {
      pendingPlayRef.current = false;
      pendingPlaySequenceRef.current = null;
      setPendingPlayCardKey(null);
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }, [data?.game.sequence, data?.legalCardKeys, data?.state, gameId, playCard]);

  function handlePreMoveCard(card: Card | null) {
    if (!card) {
      setPreMoveCardKey(null);
      return;
    }
    if (
      !canQueuePreMoveIntent({
        state: data?.state,
        card,
        isPlayInFlight: pendingPlayRef.current,
      })
    ) {
      return;
    }
    setError(null);
    setPreMoveCardKey((current) => (current === card.key ? null : card.key));
  }

  useEffect(() => {
    if (!preMoveCardKey) return;
    const card = data?.state?.hands[0]?.find((handCard) => handCard.key === preMoveCardKey);
    if (
      !card ||
      !canSendPlayCardIntent({
        state: data?.state,
        legalCardKeys: data?.legalCardKeys,
        card,
        isPlayInFlight: pendingPlayRef.current,
      })
    ) {
      return;
    }

    void handlePlayCard(card);
  }, [data?.game.sequence, data?.legalCardKeys, data?.state, handlePlayCard, preMoveCardKey]);

  useEffect(() => {
    if (!preMoveCardKey) return;
    if (canKeepPreMoveIntent({ state: data?.state, cardKey: preMoveCardKey })) return;
    setPreMoveCardKey(null);
  }, [data?.game.sequence, data?.state, preMoveCardKey]);

  async function handleAdvanceRound() {
    if (pendingAdvance || data?.state?.phase !== "round-end") return;
    pendingAdvanceSequenceRef.current = data.game.sequence;
    setPendingAdvance(true);
    setError(null);

    try {
      await advanceRound({ gameId });
    } catch (err) {
      pendingAdvanceSequenceRef.current = null;
      setPendingAdvance(false);
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  if (!data) {
    return (
      <div className="gb-play-screen gb-route-fallback">
        <div className="eyebrow">Loading room</div>
      </div>
    );
  }

  if (data.game.status === "setup" || !data.state) {
    return (
      <div className="gb-lobby gb-lobby-screen">
        <div className="gb-lobby-card fade-in">
          <div className="gb-lobby-header">
            <div className="gb-wordmark-rule" aria-hidden="true" />
            <h1 className="gb-lobby-h1" aria-label="German Bridge">
              <span>Room</span>
              <span>{data.inviteCode}</span>
            </h1>
          </div>

          <div className="gb-resume-banner">
            <div>
              <div className="eyebrow gb-live-kicker">Invite code</div>
              <div className="gb-live-meta mono">{data.inviteCode}</div>
            </div>
            <Button
              color="tertiary"
              size="sm"
              type="button"
              onClick={() => navigator.clipboard?.writeText(data.inviteCode)}
            >
              Copy
            </Button>
          </div>

          <div className="gb-lobby-grid">
            <div className="gb-lobby-block gb-lobby-seating">
              <div className="eyebrow">Seats</div>
              <div className="gb-seat-row">
                {seats.map((seat, seatIdx) => (
                  <button
                    type="button"
                    key={seatIdx}
                    className={"gb-seat-tile" + (seat?.userId === viewerParticipant?.userId ? " you" : "")}
                    onClick={() => run(() => claimSeat({ gameId, seatIdx }))}
                    disabled={!!seat && seat.userId !== viewerParticipant?.userId}
                  >
                    <Avatar name={seat?.name ?? `Seat ${seatIdx + 1}`} seed={seatIdx} size={36} />
                    <div className="gb-seat-copy">
                      <div className="gb-seat-name">{seat?.name ?? `Seat ${seatIdx + 1}`}</div>
                      <div className="gb-seat-meta">{seat ? "Human" : "Open"}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="gb-lobby-block gb-lobby-setup">
              <div className="eyebrow">Start game</div>
              <div className="gb-live-meta">
                {data.game.playerCount} players · {data.game.decks} deck
                {data.game.decks > 1 ? "s" : ""} ·{" "}
                {formatHandLadder(
                  data.game.tricksPerHand,
                  data.game.maxRounds,
                  data.game.startingTricksPerHand ?? 1,
                )}
              </div>
              <div className="gb-field">
                <div className="gb-field-label">Bot style for empty seats</div>
                <div className="gb-segmented" role="radiogroup">
                  {MOODS.map((mood) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={botMood === mood.id}
                      className={botMood === mood.id ? "on" : ""}
                      key={mood.id}
                      onClick={() => setBotMood(mood.id)}
                    >
                      <span>{mood.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {error && <div className="gb-auth-error">{error}</div>}
              <div className="gb-lobby-actions">
                <Button
                  className="gb-deal-button"
                  size="md"
                  onClick={() => run(() => startRoom({ gameId, botMood }))}
                >
                  Start game
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (data.game.status === "abandoned") {
    return (
      <div className="gb-play-screen gb-route-fallback">
        <div className="eyebrow">Room abandoned</div>
        <Button size="md" onClick={() => router.push("/")}>
          Back to lobby
        </Button>
      </div>
    );
  }

  return (
    <div className="gb-play-screen relative" data-cardback={cardBack} data-layout={layout}>
      <TableView
        state={data.state}
        onBid={handleBid}
        onPlay={handlePlayCard}
        onPreMove={handlePreMoveCard}
        cardPlayDisabled={pendingPlayCardKey != null}
        bidSubmitting={pendingBid}
        preMoveCardKey={preMoveCardKey}
        onAbandon={() => run(async () => {
          await endRoom({ gameId });
          router.push("/");
        })}
      />
      <TrickBanner state={data.state} />
      {data.state.phase === "round-end" && (
        <RoundSummary
          state={data.state}
          canAdvance={data.viewerIsHost}
          isAdvancing={pendingAdvance}
          onAdvance={handleAdvanceRound}
        />
      )}
      {data.state.phase === "match-end" && (
        <MatchEnd
          state={data.state}
          onFinish={(destination) => router.push(destination === "history" ? "/history" : "/")}
        />
      )}
      {error && <div className="gb-live-error">{error}</div>}
    </div>
  );
}
