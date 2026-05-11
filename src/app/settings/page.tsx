"use client";

import { useEffect, useId, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import { useSettings } from "@/store/settings";
import { useMatch } from "@/store/match";
import { Icon } from "@/components/Icon";
import type { Personality } from "@/lib/bot";
import { MAX_DECKS } from "@/lib/cards";
import { layoutTransition, stateTransition } from "@/lib/uiMotion";
import { useGameViewportLock } from "../useGameViewportLock";

const THEMES = [
  { id: "emerald", label: "Emerald" },
  { id: "midnight", label: "Midnight" },
  { id: "graphite", label: "Graphite" },
] as const;

const CARD_BACKS = [
  { id: "classic", label: "Classic crosshatch" },
  { id: "lattice", label: "Brass lattice" },
  { id: "monogram", label: "Monogram" },
] as const;

const LAYOUTS = [
  { id: "salon", label: "Salon" },
  { id: "pad", label: "Card-pad" },
] as const;

const MOODS: { id: Personality; label: string }[] = [
  { id: "cautious", label: "Cautious" },
  { id: "mixed", label: "Mixed" },
  { id: "aggressive", label: "Aggressive" },
];

const SETTINGS_NAV = [
  { href: "#profile", label: "Profile", icon: "user" },
  { href: "#look", label: "Look", icon: "palette" },
  { href: "#bots", label: "Bots", icon: "bot" },
  { href: "#defaults", label: "Defaults", icon: "sliders" },
  { href: "#danger", label: "Danger zone", icon: "warning", danger: true },
];

export default function SettingsPage() {
  const s = useSettings();
  const { defaultDecks, set: setSetting } = s;
  const [activeSection, setActiveSection] = useState("profile");
  useGameViewportLock();
  useEffect(() => {
    if (defaultDecks > MAX_DECKS) setSetting("defaultDecks", MAX_DECKS);
  }, [defaultDecks, setSetting]);
  useEffect(() => {
    const syncHash = () => setActiveSection(window.location.hash.slice(1) || "profile");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);
  const abandon = useMatch((m) => m.abandonMatch);

  return (
    <div className="gb-settings-page">
      <div className="gb-settings-inner">
        <div className="eyebrow">German Bridge</div>
        <h1 className="gb-history-title">Settings</h1>

        <div className="gb-settings-shell">
          <LayoutGroup id="settings-rail">
            <nav className="gb-settings-rail" aria-label="Settings sections">
              {SETTINGS_NAV.map((item) => {
                const active = activeSection === item.href.slice(1);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={[
                      item.danger ? "danger" : "",
                      active ? "active" : "",
                    ].filter(Boolean).join(" ") || undefined}
                  >
                    {active && (
                      <motion.span
                        layoutId="settings-rail-active"
                        className="gb-settings-rail-active"
                        transition={layoutTransition}
                        aria-hidden="true"
                      />
                    )}
                    <Icon name={item.icon} size={17} />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </nav>
          </LayoutGroup>

          <div className="gb-settings-content">
            <Section id="profile" title="Profile" className="compact">
              <Field label="Display name">
                <input
                  className="gb-settings-input"
                  aria-label="Display name"
                  value={s.playerName}
                  onChange={(e) => s.set("playerName", e.target.value || "You")}
                  maxLength={24}
                />
              </Field>
            </Section>

            <div className="gb-settings-columns">
              <div className="gb-settings-stack">
                <Section id="look" title="Look">
                  <Field label="Theme">
                    <Segmented
                      value={s.theme}
                      options={THEMES.map((t) => ({ value: t.id, label: t.label }))}
                      onChange={(v) => s.set("theme", v as typeof s.theme)}
                    />
                  </Field>
                  <Field label="Table layout">
                    <Segmented
                      value={s.layout}
                      options={LAYOUTS.map((l) => ({ value: l.id, label: l.label }))}
                      onChange={(v) => s.set("layout", v as typeof s.layout)}
                    />
                  </Field>
                  <Field label="Card back">
                    <Segmented
                      value={s.cardBack}
                      options={CARD_BACKS.map((c) => ({ value: c.id, label: c.label }))}
                      onChange={(v) => s.set("cardBack", v as typeof s.cardBack)}
                    />
                  </Field>
                  <Field label="Trump marker on your cards">
                    <Toggle
                      label="Trump marker on your cards"
                      value={s.showTrumpHints}
                      onChange={(v) => s.set("showTrumpHints", v)}
                    />
                  </Field>
                  <Field label="Animations">
                    <Toggle
                      label="Animations"
                      value={s.animations}
                      onChange={(v) => s.set("animations", v)}
                    />
                  </Field>
                </Section>
              </div>

              <div className="gb-settings-stack">
                <Section id="bots" title="Bots">
                  <Field label="Default mood">
                    <Segmented
                      value={s.defaultBotMood}
                      options={MOODS.map((m) => ({ value: m.id, label: m.label }))}
                      onChange={(v) => s.set("defaultBotMood", v as Personality)}
                    />
                  </Field>
                </Section>

                <Section id="defaults" title="Match defaults">
                  <div className="gb-settings-num-grid">
                    <NumField
                      label="Players"
                      value={s.defaultPlayers}
                      min={3}
                      max={12}
                      onChange={(v) => s.set("defaultPlayers", v)}
                    />
                    <NumField
                      label="Decks"
                      value={Math.min(MAX_DECKS, s.defaultDecks)}
                      min={1}
                      max={MAX_DECKS}
                      onChange={(v) => s.set("defaultDecks", v)}
                    />
                    <NumField
                      label="Tricks per hand"
                      value={s.defaultTricksPerHand}
                      min={1}
                      max={99}
                      onChange={(v) => s.set("defaultTricksPerHand", v)}
                    />
                  </div>
                </Section>

                <Section id="danger" title="Danger zone" className="danger-section">
                  <div className="gb-danger-actions">
                    <button
                      className="btn"
                      onClick={() => {
                        if (confirm("Reset visual + match defaults to factory? Match history is kept.")) {
                          s.reset();
                        }
                      }}
                    >
                      Reset settings
                    </button>
                    <button
                      className="btn danger"
                      onClick={() => {
                        if (confirm("Discard the in-progress match? It will be removed.")) {
                          abandon();
                        }
                      }}
                    >
                      Discard active match
                    </button>
                  </div>
                </Section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={"gb-settings-section " + className}>
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

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const layoutId = "gb-segmented-" + useId().replace(/:/g, "");
  return (
    <div className="gb-segmented" role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === o.value}
          key={o.value}
          onClick={() => onChange(o.value)}
          className={value === o.value ? "on" : ""}
        >
          {value === o.value && (
            <motion.span
              layoutId={layoutId}
              className="gb-segmented-active"
              transition={layoutTransition}
              aria-hidden="true"
            />
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onChange(!value)}
      className={"gb-toggle" + (value ? " on" : "")}
      aria-label={label}
      aria-pressed={value}
      whileTap={{ scale: 0.985 }}
      transition={stateTransition}
    >
      <motion.span
        className="gb-toggle-thumb"
        animate={{ x: value ? 20 : 0 }}
        transition={layoutTransition}
      />
    </motion.button>
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
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="gb-settings-input mono"
        aria-label={label}
        value={value}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "");
          if (raw === "") return;
          const v = parseInt(raw, 10);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </Field>
  );
}
