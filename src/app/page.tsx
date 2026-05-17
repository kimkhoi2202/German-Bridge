"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { AuthGate } from "@/components/AuthGate";
import { Button } from "@/components/base/buttons/button";
import { useBoundedNumberInput } from "@/components/useBoundedNumberInput";
import { MAX_DECKS, maxTricks } from "@/lib/cards";
import type { Personality } from "@/lib/bot";
import { useGameViewportLock } from "./useGameViewportLock";

const MOODS: { id: Personality; label: string }[] = [
  { id: "cautious", label: "Cautious" },
  { id: "mixed", label: "Mixed" },
  { id: "aggressive", label: "Aggressive" },
  { id: "champion", label: "Champion" },
  { id: "gpt", label: "GPT" },
];

export default function LobbyPage() {
  return (
    <AuthGate>
      <LobbyContent />
    </AuthGate>
  );
}

function LobbyContent() {
  const router = useRouter();
  const settings = useQuery(api.settings.get);
  const createRoom = useMutation(api.rooms.create);
  const joinByCode = useMutation(api.rooms.joinByCode);
  useGameViewportLock();

  const [playerCount, setPlayerCount] = useState(4);
  const [decks, setDecks] = useState(1);
  const [tricks, setTricks] = useState(10);
  const [botMood, setBotMood] = useState<Personality>("mixed");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setPlayerCount(settings.defaultPlayers);
    setDecks(settings.defaultDecks);
    setTricks(settings.defaultTricksPerHand);
    setBotMood(settings.defaultBotMood);
  }, [settings]);

  const max = Math.max(1, maxTricks(playerCount, decks));
  const safeTricks = Math.min(tricks, max);
  const totalCards = 52 * decks;
  const largestHandCards = playerCount * safeTricks + 1;

  useEffect(() => {
    if (tricks > max) setTricks(max);
  }, [max, tricks]);

  async function onCreate() {
    setError(null);
    setBusy(true);
    try {
      const room = await createRoom({
        playerCount,
        decks,
        tricksPerHand: safeTricks,
        botMood,
      });
      router.push(`/play/${room.gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room");
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const room = await joinByCode({ inviteCode });
      router.push(`/play/${room.gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gb-lobby gb-lobby-screen">
      <div className="gb-lobby-card fade-in">
        <div className="gb-lobby-header">
          <div className="gb-wordmark-rule" aria-hidden="true" />
          <h1 className="gb-lobby-h1" aria-label="German Bridge">
            <span>German</span>
            <span>Bridge</span>
          </h1>
        </div>

        <div className="gb-lobby-grid">
          <div className="gb-lobby-block gb-lobby-setup">
            <div className="eyebrow">Create private room</div>
            <div className="gb-knob-row">
              <Knob label="Players" value={playerCount} min={3} max={12} set={setPlayerCount} />
              <Knob label="Decks" value={decks} min={1} max={MAX_DECKS} set={setDecks} />
              <Knob
                label="Max hand size"
                value={safeTricks}
                min={1}
                max={max}
                set={setTricks}
                headerMeta={`max ${max}`}
              />
            </div>

            <div className="gb-lobby-validate">
              <span className="mono">
                Largest hand uses {largestHandCards} of {totalCards} cards
              </span>
              <span>plays hands 1-{safeTricks}</span>
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
                    onClick={() => {
                      setBotMood(mood.id);
                      if (mood.id === "champion") setDecks(2);
                    }}
                  >
                    <span>{mood.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="gb-lobby-actions">
              <Button size="md" className="gb-deal-button" onClick={onCreate} isDisabled={busy}>
                Create room
              </Button>
            </div>
          </div>

          <form className="gb-lobby-block gb-lobby-seating" onSubmit={onJoin}>
            <div className="eyebrow">Join private room</div>
            <label className="gb-profile-row">
              <span className="eyebrow">Invite code</span>
              <span className="gb-profile-input-wrap">
                <input
                  className="gb-name-input mono"
                  aria-label="Invite code"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder="CODE"
                  spellCheck={false}
                  autoComplete="off"
                />
              </span>
            </label>
            <Button size="md" isDisabled={busy || inviteCode.trim().length < 3}>
              Join room
            </Button>
            {error && <div className="gb-auth-error">{error}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}

function Knob({
  label,
  value,
  min,
  max,
  set,
  headerMeta,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  set: (value: number) => void;
  headerMeta?: string;
}) {
  const update = (next: number) => {
    if (!Number.isFinite(next)) return;
    set(Math.min(max, Math.max(min, next)));
  };
  const input = useBoundedNumberInput({ value, min, max, onChange: update });

  return (
    <div className="gb-knob">
      <div className="gb-knob-label">
        <span className="gb-knob-title">
          <span>{label}</span>
          {headerMeta && <span className="gb-knob-meta">{headerMeta}</span>}
        </span>
      </div>
      <div className="gb-knob-control">
        <button
          type="button"
          className="gb-knob-btn"
          aria-label={`Decrease ${label}`}
          onClick={() => update(value - 1)}
          disabled={value <= min}
        >
          −
        </button>
        <input
          className="gb-knob-input mono"
          aria-label={label}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={input.value}
          onFocus={input.onFocus}
          onChange={input.onChange}
          onBlur={input.onBlur}
          onKeyDown={input.onKeyDown}
        />
        <button
          type="button"
          className="gb-knob-btn"
          aria-label={`Increase ${label}`}
          onClick={() => update(value + 1)}
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  );
}
