# German Bridge

A fully playable, single-player-vs-bots implementation of German Bridge, the
trick-taking card game, built with **Next.js 15 + TypeScript**.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Other scripts:

```bash
pnpm build        # production bundle
pnpm test         # all 61 unit + integration tests
pnpm typecheck
pnpm lint
```

## What's playable

- **Custom scoring**: `+10 + n²` if you make your bid; `−|bid − won|²` if you miss.
- **Three knobs**: 3–12 players, 1–4 decks, tricks-per-hand up to `floor((52·D − 1)/P)`.
- **Multi-deck tie rule**: when two identical cards land in the same trick, the *later-played* one wins.
- **Last-bidder restriction**: the final bidder cannot pick a number that makes the totals equal the trick count — disabled bid option with tooltip.
- **Bot AI**: per-seat personality (cautious / mixed / aggressive) overridable from the lobby; global default in Settings.
- **Persistence**: in-progress match auto-saves to `localStorage` (refresh keeps you exactly where you were); finished matches archive to History.
- **Themes**: 5 palettes; salon (felt) + card-pad layouts; 3 card-back styles.
- **Animations**: Framer Motion for trump reveal, card play, trick-winner glow, summary modals.

## Architecture

```
src/
├── lib/                 # pure game logic — no React, fully tested
│   ├── cards.ts         # deck/shoe, ranks, sorting, legal-cards
│   ├── trick.ts         # trick resolution (incl. second-card-wins)
│   ├── scoring.ts       # 10 + n² / −d²
│   ├── bot.ts           # bid + play heuristics by personality
│   └── game.ts          # state machine: phase transitions
├── store/               # Zustand state (persisted)
│   ├── settings.ts      # visual prefs + lobby defaults
│   └── match.ts         # active match + archive
├── components/          # presentational components
│   ├── PlayingCard.tsx
│   ├── Avatar.tsx
│   ├── Icon.tsx
│   ├── NumberKnob.tsx
│   ├── BottomNav.tsx
│   └── ThemeApplier.tsx
└── app/                 # Next.js App Router pages
    ├── page.tsx         # Lobby
    ├── play/            # Play screen + bidding dial + summary modals
    ├── history/         # Match archive
    ├── rules/           # How to play
    └── settings/        # Theme, layout, defaults
```

Game logic is fully decoupled from React — every state transition is a pure
function, which made integration testing easy: 3 brutal tests run full matches
with bots driving every seat (4-player, 12-player, 17-trick max-deck).

## Tests

```
src/lib/cards.test.ts          15 tests
src/lib/scoring.test.ts         5 tests
src/lib/trick.test.ts           8 tests
src/lib/bot.test.ts             8 tests
src/lib/botObservation.test.ts  4 tests
src/lib/game.test.ts           12 tests
src/lib/integration.test.ts     3 tests   ← full match simulations
src/lib/ai/dataset.test.ts      3 tests
src/lib/ai/headless.test.ts     5 tests
src/lib/ai/policies.test.ts     1 test
src/lib/ai/ratings.test.ts      8 tests
src/store/match.test.ts         4 tests   ← store actions end-to-end
src/app/play/BiddingDial.test.tsx 2 tests
src/components/NumberKnob.test.tsx 5 tests
src/test/env.test.ts            1 test
                              ───────
                               84 tests
```

## AI Training Scaffold

The AI tooling is locked to the first research target: **2 decks, 4-12 players,
one flipped trump card, variable tricks per hand**.

Generate JSONL decision examples for supervised learning or later RL pipelines:

```bash
pnpm ai:dataset -- --players 6 --tricks 8 --matches 1000 --out ai-data/6p-8t.jsonl
```

Each JSONL line contains a fair `BotObservation`, the policy action, and the
final score/rank outcome. Generated datasets go in `ai-data/`, which is ignored
by git.

Run a quick rollout-search challenger evaluation against baseline bots:

```bash
pnpm ai:evaluate -- --players 6 --tricks 8 --matches 100 --challenger-seat 0
```

## Notable choices

- **Tailwind v4** for utilities + a hand-written CSS theme layer (oklch tokens)
  because the design uses gradients/shadows that aren't worth retorquing into
  Tailwind classes. Themes are switched via `[data-theme]` on `<html>`.
- **Persist via Zustand `persist` middleware** with `createJSONStorage` and a
  memory fallback so SSR (and tests) don't crash.
- **Bots act with a 700–1100ms delay** so the human can watch what's happening.
  Tied via React effects in `src/app/play/useBotDriver.ts`.
- **Second-card-wins** is implemented by switching `>` to `>=` when comparing
  ranks within the same tier in `resolveTrick`. Verified by 3 dedicated tests.
