"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { MAX_DECKS, maxTricks } from "@/lib/cards";
import type { Personality } from "@/lib/bot";
import { useMatch } from "@/store/match";
import { useSettings } from "@/store/settings";
import { useGameViewportLock } from "./useGameViewportLock";

const BOT_NAMES = [
  "Margot", "Theodore", "Imani", "Kasper", "Vesna", "Reuben",
  "Saoirse", "Bertram", "Ondine", "Fabien", "Linnea",
];
const MENU_HEIGHT = 184;

export default function LobbyPage() {
  const router = useRouter();
  const settings = useSettings();
  const startMatch = useMatch((s) => s.startMatch);
  const matchState = useMatch((s) => s.state);
  const abandon = useMatch((s) => s.abandonMatch);
  useGameViewportLock();

  const [hydrated, setHydrated] = useState(false);
  const [playerCount, setPlayerCount] = useState(4);
  const [decks, setDecks] = useState(1);
  const [tricks, setTricks] = useState(10);
  const [name, setName] = useState("You");
  const [overrides, setOverrides] = useState<(Personality | null)[]>(Array(11).fill(null));

  useEffect(() => {
    if (!hydrated) {
      setPlayerCount(settings.defaultPlayers);
      setDecks(Math.min(MAX_DECKS, Math.max(1, settings.defaultDecks)));
      setTricks(settings.defaultTricksPerHand);
      setName(settings.playerName);
      setHydrated(true);
    }
  }, [hydrated, settings]);

  const max = maxTricks(playerCount, decks);
  const ceiling = Math.max(1, max);
  const tricksValid = max >= 1 && tricks >= 1 && tricks <= max;
  const totalCards = 52 * decks;
  const usedCards = playerCount * tricks + 1;
  const undealtCards = Math.max(0, totalCards - usedCards);

  useEffect(() => {
    if (max >= 1 && tricks > max) setTricks(max);
  }, [max, tricks]);

  const setBotPersonality = (idx: number, value: Personality | null) => {
    setOverrides((cur) => {
      const next = [...cur];
      next[idx] = value;
      return next;
    });
  };

  const onStart = () => {
    if (!tricksValid) return;
    settings.set("defaultPlayers", playerCount);
    settings.set("defaultDecks", decks);
    settings.set("defaultTricksPerHand", tricks);
    settings.set("playerName", name || "You");

    startMatch({
      playerCount,
      decks,
      tricksPerHand: tricks,
      botMood: settings.defaultBotMood,
      botOverrides: overrides,
      playerName: name || "You",
    });
    router.push("/play");
  };

  const moods: Personality[] = ["cautious", "mixed", "aggressive"];

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

        {matchState && (
          <div className="gb-resume-banner">
            <div>
              <div className="eyebrow gb-live-kicker">
                A match is in progress
              </div>
              <div className="gb-live-meta">
                {matchState.players.length} players · {matchState.decks} deck
                {matchState.decks > 1 ? "s" : ""} · {matchState.tricksPerHand} tricks
              </div>
            </div>
            <div className="gb-resume-actions">
              <button className="btn brass" onClick={() => router.push("/play")}>
                Resume <Icon name="chevR" size={14} />
              </button>
              <button
                className="btn ghost gb-resume-discard"
                onClick={() => abandon()}
              >
                Discard
              </button>
            </div>
          </div>
        )}

        <div className="gb-lobby-grid">
          <div className="gb-lobby-block gb-lobby-setup">
            <div className="eyebrow">Match setup</div>
            <div className="gb-knob-row">
              <Knob
                label="Players"
                value={playerCount}
                set={(v) => setPlayerCount(Math.min(12, Math.max(3, v)))}
                min={3}
                max={12}
              />
              <Knob
                label="Decks"
                value={decks}
                set={(v) => setDecks(Math.min(MAX_DECKS, Math.max(1, v)))}
                min={1}
                max={MAX_DECKS}
              />
              <Knob
                label="Tricks per hand"
                value={tricks}
                set={(v) => setTricks(Math.min(ceiling, Math.max(1, v)))}
                min={1}
                max={ceiling}
                headerMeta={`max ${max}`}
                hint={max < 1 ? "Impossible hand" : undefined}
              />
            </div>

            <div className={"gb-lobby-validate" + (tricksValid ? "" : " bad")}>
              <span className="mono">
                {usedCards} of {totalCards} cards used
              </span>
              {tricksValid && <span>{undealtCards} undealt</span>}
              {!tricksValid && (
                <span className="gb-bad">
                  {max < 1
                    ? "Increase decks or reduce players."
                    : `Tricks per hand must be 1–${max}.`}
                </span>
              )}
            </div>

            <label className="gb-profile-row">
              <span className="eyebrow">Display name</span>
              <span className="gb-profile-input-wrap">
                <Avatar name={name} seed={0} size={34} />
                <input
                  className="gb-name-input"
                  aria-label="Display name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={24}
                  spellCheck={false}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore
                />
              </span>
            </label>

            <div className="gb-lobby-actions">
              <button className="btn brass gb-deal-button" onClick={onStart} disabled={!tricksValid}>
                Deal hand
              </button>
            </div>
          </div>

          <div className="gb-lobby-block gb-lobby-seating">
            <div className="eyebrow">Table seating</div>
            <div className="gb-seat-row">
              <div className="gb-seat-tile you">
                <Avatar name={name} seed={0} size={36} />
                <div className="gb-seat-copy">
                  <div className="gb-seat-name">{name || "You"}</div>
                  <div className="gb-seat-meta">You</div>
                </div>
              </div>
              {Array.from({ length: playerCount - 1 }, (_, i) => {
                const baseMood: Personality =
                  settings.defaultBotMood === "mixed"
                    ? moods[i % 3]
                    : settings.defaultBotMood;
                return (
                  <div key={i} className="gb-seat-tile">
                    <Avatar name={BOT_NAMES[i % BOT_NAMES.length]} seed={i + 1} size={36} />
                    <div className="gb-seat-copy">
                      <div className="gb-seat-name">{BOT_NAMES[i % BOT_NAMES.length]}</div>
                      <div className="gb-seat-meta">Bot</div>
                    </div>
                    <PersonalitySelect
                      baseMood={baseMood}
                      label={`Personality for ${BOT_NAMES[i % BOT_NAMES.length]}`}
                      value={overrides[i] ?? null}
                      onChange={(value) => setBotPersonality(i, value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonalitySelect({
  baseMood,
  label,
  value,
  onChange,
}: {
  baseMood: Personality;
  label: string;
  value: Personality | null;
  onChange: (value: Personality | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState({ left: 0, top: 0, width: 160 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const options: { value: Personality | null; label: string }[] = [
    { value: null, label: `auto · ${baseMood}` },
    { value: "cautious", label: "cautious" },
    { value: "mixed", label: "mixed" },
    { value: "aggressive", label: "aggressive" },
  ];
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const positionMenu = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(168, rect.width);
      const gap = 8;
      const left = Math.min(window.innerWidth - width - gap, Math.max(gap, rect.left));
      const hasRoomBelow = window.innerHeight - rect.bottom >= MENU_HEIGHT + gap;
      const top = hasRoomBelow
        ? rect.bottom + gap
        : Math.max(gap, rect.top - MENU_HEIGHT - gap);
      setMenuBox({ left, top, width });
    };

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    requestAnimationFrame(() => {
      const currentOption = menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      currentOption?.focus();
    });

    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (nextValue: Personality | null) => {
    onChange(nextValue);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="gb-pers">
      <button
        ref={buttonRef}
        type="button"
        className="gb-pers-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        data-open={open ? "1" : "0"}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="gb-pers-value">{selected.label}</span>
        <Icon name="chevR" size={13} className="gb-pers-chevron" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="gb-pers-menu"
            role="listbox"
            aria-label={label}
            style={{ left: menuBox.left, top: menuBox.top, width: menuBox.width }}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value ?? "auto"}
                  type="button"
                  className="gb-pers-option"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => choose(option.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      const items = Array.from(
                        menuRef.current?.querySelectorAll<HTMLButtonElement>(".gb-pers-option") ??
                          [],
                      );
                      const direction = event.key === "ArrowDown" ? 1 : -1;
                      const next = (index + direction + items.length) % items.length;
                      items[next]?.focus();
                    }
                  }}
                >
                  <span className="gb-pers-check" aria-hidden="true">
                    <Icon name="check" size={15} />
                  </span>
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

function Knob({
  label,
  value,
  set,
  min,
  max,
  suffix,
  headerMeta,
  hint,
}: {
  label?: string;
  value: number;
  set: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
  headerMeta?: string;
  hint?: string;
}) {
  return (
    <div className="gb-knob">
      {(label || hint) && (
        <div className="gb-knob-label">
          <span className="gb-knob-title">
            {label && <span className="eyebrow">{label}</span>}
            <span className="gb-knob-range">
              {min}–{max}
            </span>
            {headerMeta && <span className="gb-knob-meta">{headerMeta}</span>}
          </span>
          {hint && <span className="gb-knob-hint">{hint}</span>}
        </div>
      )}
      <div className="gb-knob-control">
        <button
          className="gb-knob-btn"
          onClick={() => set(value - 1)}
          disabled={value <= min}
          aria-label={`Decrease ${label ?? ""}`}
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="gb-knob-input mono"
          aria-label={label ?? "Number"}
          value={value}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "");
            if (raw === "") return;
            const v = parseInt(raw, 10);
            if (Number.isFinite(v)) set(v);
          }}
        />
        {suffix && <span className="gb-knob-suffix">{suffix}</span>}
        <button
          className="gb-knob-btn"
          onClick={() => set(value + 1)}
          disabled={value >= max}
          aria-label={`Increase ${label ?? ""}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
