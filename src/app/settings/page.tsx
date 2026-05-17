"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { AuthGate } from "@/components/AuthGate";
import { Button } from "@/components/base/buttons/button";
import { useBoundedNumberInput } from "@/components/useBoundedNumberInput";
import type { Personality } from "@/lib/bot";
import { MAX_DECKS, maxTricks } from "@/lib/cards";
import { useSettings, type CardBack, type TableLayout, type Theme } from "@/store/settings";
import { useGameViewportLock } from "../useGameViewportLock";

type SettingsDraft = {
  theme: Theme;
  cardBack: CardBack;
  layout: TableLayout;
  showTrumpHints: boolean;
  animations: boolean;
  defaultPlayers: number;
  defaultDecks: number;
  defaultTricksPerHand: number;
  defaultBotMood: Personality;
};

function toSettingsDraft(settings: SettingsDraft): SettingsDraft {
  return {
    theme: settings.theme,
    cardBack: settings.cardBack,
    layout: settings.layout,
    showTrumpHints: settings.showTrumpHints,
    animations: settings.animations,
    defaultPlayers: settings.defaultPlayers,
    defaultDecks: settings.defaultDecks,
    defaultTricksPerHand: settings.defaultTricksPerHand,
    defaultBotMood: settings.defaultBotMood,
  };
}

const THEMES: { id: Theme; label: string }[] = [
  { id: "emerald", label: "Emerald" },
  { id: "midnight", label: "Midnight" },
  { id: "graphite", label: "Graphite" },
];
const CARD_BACKS: { id: CardBack; label: string }[] = [
  { id: "classic", label: "Classic crosshatch" },
  { id: "lattice", label: "Brass lattice" },
  { id: "monogram", label: "Monogram" },
];
const LAYOUTS: { id: TableLayout; label: string }[] = [
  { id: "salon", label: "Salon" },
  { id: "pad", label: "Card-pad" },
];
const MOODS: { id: Personality; label: string }[] = [
  { id: "cautious", label: "Cautious" },
  { id: "mixed", label: "Mixed" },
  { id: "aggressive", label: "Aggressive" },
  { id: "champion", label: "Champion" },
  { id: "gpt", label: "GPT" },
];

export default function SettingsPage() {
  return (
    <AuthGate>
      <SettingsContent />
    </AuthGate>
  );
}

function SettingsContent() {
  const profile = useQuery(api.profiles.me);
  const settings = useQuery(api.settings.get);
  const stats = useQuery(api.stats.mine);
  const saveSettings = useMutation(api.settings.save);
  const updateProfile = useMutation(api.profiles.update);
  const localSet = useSettings((s) => s.set);
  const { signOut } = useAuthActions();
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  useGameViewportLock();

  useEffect(() => {
    if (!settings) return;
    const nextDraft = toSettingsDraft(settings);
    setDraft(nextDraft);
    localSet("theme", nextDraft.theme);
    localSet("cardBack", nextDraft.cardBack);
    localSet("layout", nextDraft.layout);
    localSet("showTrumpHints", nextDraft.showTrumpHints);
    localSet("animations", nextDraft.animations);
    localSet("defaultPlayers", nextDraft.defaultPlayers);
    localSet("defaultDecks", nextDraft.defaultDecks);
    localSet("defaultTricksPerHand", nextDraft.defaultTricksPerHand);
    localSet("defaultBotMood", nextDraft.defaultBotMood);
  }, [settings, localSet]);

  useEffect(() => {
    if (profile?.displayName) setDisplayName(profile.displayName);
  }, [profile?.displayName]);

  async function save(next: SettingsDraft) {
    setError(null);
    try {
      await saveSettings(toSettingsDraft(next));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    }
  }

  function update<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) {
    if (!draft) return;
    const previousTricks = draft.defaultTricksPerHand;
    const next = { ...draft, [key]: value };
    if (
      key === "defaultPlayers" ||
      key === "defaultDecks" ||
      key === "defaultTricksPerHand"
    ) {
      const cap = Math.max(1, maxTricks(next.defaultPlayers, next.defaultDecks));
      next.defaultTricksPerHand = Math.min(cap, Math.max(1, next.defaultTricksPerHand));
    }
    setDraft(next);
    localSet(key as never, next[key] as never);
    if (next.defaultTricksPerHand !== previousTricks && key !== "defaultTricksPerHand") {
      localSet("defaultTricksPerHand" as never, next.defaultTricksPerHand as never);
    }
    void save(next);
  }

  if (!draft) {
    return (
      <div className="gb-settings-page">
        <div className="gb-settings-inner">
          <div className="eyebrow">Loading settings</div>
        </div>
      </div>
    );
  }

  return (
    <div className="gb-settings-page">
      <div className="gb-settings-inner">
        <div className="eyebrow">German Bridge</div>
        <h1 className="gb-history-title">Settings</h1>

        <div className="gb-settings-shell">
          <div className="gb-settings-content">
            <Section id="profile" title="Profile">
              <Field label="Display name">
                <input
                  className="gb-settings-input"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  onBlur={() => updateProfile({ displayName }).catch((err) => setError(String(err)))}
                  maxLength={24}
                />
              </Field>
              <Button color="tertiary" size="md" onClick={() => signOut()}>
                Sign out
              </Button>
              {stats && (
                <div className="gb-history-score-grid">
                  <Stat label="Games" value={stats.gamesPlayed} />
                  <Stat label="Wins" value={stats.gamesWon} />
                  <Stat
                    label="Avg"
                    value={stats.gamesPlayed ? Math.round(stats.totalScore / stats.gamesPlayed) : 0}
                  />
                  <Stat label="Best" value={stats.bestScore} />
                </div>
              )}
            </Section>

            <div className="gb-settings-columns">
              <div className="gb-settings-stack">
                <Section id="look" title="Look">
                  <Field label="Theme">
                    <Segmented value={draft.theme} options={THEMES} onChange={(value) => update("theme", value)} />
                  </Field>
                  <Field label="Table layout">
                    <Segmented value={draft.layout} options={LAYOUTS} onChange={(value) => update("layout", value)} />
                  </Field>
                  <Field label="Card back">
                    <Segmented value={draft.cardBack} options={CARD_BACKS} onChange={(value) => update("cardBack", value)} />
                  </Field>
                  <Field label="Trump marker on your cards">
                    <Toggle value={draft.showTrumpHints} onChange={(value) => update("showTrumpHints", value)} />
                  </Field>
                  <Field label="Animations">
                    <Toggle value={draft.animations} onChange={(value) => update("animations", value)} />
                  </Field>
                </Section>
              </div>

              <div className="gb-settings-stack">
                <Section id="defaults" title="Match defaults">
                  <div className="gb-settings-num-grid">
                    <NumField label="Players" value={draft.defaultPlayers} min={3} max={12} onChange={(value) => update("defaultPlayers", value)} />
                    <NumField label="Decks" value={draft.defaultDecks} min={1} max={MAX_DECKS} onChange={(value) => update("defaultDecks", value)} />
                    <NumField
                      label="Max hand size"
                      value={draft.defaultTricksPerHand}
                      min={1}
                      max={Math.max(1, maxTricks(draft.defaultPlayers, draft.defaultDecks))}
                      onChange={(value) => update("defaultTricksPerHand", value)}
                    />
                  </div>
                  <Field label="Default bot style">
                    <Segmented value={draft.defaultBotMood} options={MOODS} onChange={(value) => update("defaultBotMood", value)} />
                  </Field>
                </Section>
                {error && <div className="gb-auth-error">{error}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="gb-settings-section">
      <div className="eyebrow gb-section-kicker">{title}</div>
      <div className="gb-field-stack">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="gb-field">
      <div className="gb-field-label">{label}</div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="gb-history-score">
      <div className="gb-history-score-copy">
        <div className="gb-history-score-name">{label}</div>
        <div className="gb-history-score-num mono">{value}</div>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="gb-segmented" role="radiogroup">
      {options.map((option) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === option.id}
          key={option.id}
          className={value === option.id ? "on" : ""}
          onClick={() => onChange(option.id)}
        >
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={"gb-toggle" + (value ? " on" : "")}
      aria-pressed={value}
    >
      <span className="gb-toggle-thumb" />
    </button>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const input = useBoundedNumberInput({ value, min, max, onChange });

  return (
    <Field label={label}>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="gb-settings-input mono"
        aria-label={label}
        value={input.value}
        onFocus={input.onFocus}
        onChange={input.onChange}
        onBlur={input.onBlur}
        onKeyDown={input.onKeyDown}
      />
    </Field>
  );
}
