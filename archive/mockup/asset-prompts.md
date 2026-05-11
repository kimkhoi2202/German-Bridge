# Asset list & AI image-gen prompts

This is the full list of art assets the **Felt & Brass** poker game expects. The current build uses CSS-drawn placeholders for everything — drop a real PNG/SVG with the listed filename into `assets/` to swap it in.

For each asset I've written a copy-pasteable AI prompt aimed at **Midjourney / DALL·E 3 / Stable Diffusion XL / Flux**. The aesthetic anchors are: editorial luxury + classic casino + tasteful skeuomorphism. Deep emerald felt, brass, mahogany rail, cream card stock.

## Style anchors (paste into every prompt)

```
Style anchors: editorial luxury + classic casino, deep emerald felt, brushed brass,
mahogany rail, cream/ivory card stock, Instrument Serif italic display lockups,
Geist sans-serif UI, soft directional studio light, fine-grain felt texture,
35mm photographic feel, no text unless specified, transparent background,
no watermark, no UI chrome, no logos.
```

---

## 1 · Brand

### `logo-fb.svg`
Wordmark for "Felt & Brass" (the in-game brand placeholder you can rename).
```
A wordmark logotype reading "Felt & Brass" set in italic serif (Instrument Serif feel),
brass foil on deep mahogany ground, with a small ornate ampersand. Below the wordmark,
in 12px tracked sans-serif: "EST. 2026 · NO-LIMIT". Vector-clean, exportable as SVG.
Aspect 4:1, transparent background. No drop shadow.
```

### `logo-fb-mark.svg`
A 1:1 monogram for the sidebar.
```
A square monogram badge, 64×64. Italic serif "F" in brass on a domed mahogany surface,
hairline brass border, subtle satin highlight at top-left, soft shadow at bottom-right.
Skeuomorphic but restrained. Transparent background outside the square.
```

---

## 2 · Playing cards (52 + back)

### `cards/back.png`  (and back-alt-1, back-alt-2)
```
A poker card back, 750×1050px, 12px corner radius. Centered ornate brass medallion
on a deep oxblood ground, surrounded by a fine guilloché lattice pattern. Inside the
medallion, an italic serif "F&B" monogram. Subtle vignette, 0.5px hairline brass
border 6% inset from the edge. Photographic finish — slight paper grain,
soft directional light from top-left. Transparent corners (alpha mask), nothing bleeds
to the outer 12px. No text other than F&B.
```

### `cards/{rank}-{suit}.png`  ×52
Filename: `cards/A-s.png`, `cards/K-h.png`, …, `cards/2-c.png`.
**Faces** — generate as a sheet first, then split.
```
A photographic poker card face, 750×1050px, ivory cream stock with paper grain,
12px corner radius, hairline edge. Layout: rank "{RANK}" top-left, mirrored bottom-right,
both in heavy geometric sans-serif (Geist Bold). The {SUIT} pip below each rank.
Centered: a single large filigreed {SUIT} symbol, brass for face cards, otherwise
classical red (#a32d2d) for hearts/diamonds and ink-black (#1a1a1a) for spades/clubs.
Court cards (J/Q/K) replace the center with an art-deco engraved figure (king holds a
sword for spades, a goblet for hearts, etc.) — stylized, two-tone with brass accent,
NOT photorealistic faces. Aces have an oversized ornamental {SUIT}. Subtle drop shadow.
Transparent outside the rounded rectangle.
```

Iterate by replacing `{RANK}` with `A,K,Q,J,T,9,8,7,6,5,4,3,2` and `{SUIT}` with `spade,heart,diamond,club`.

---

## 3 · Chips

### `chips/{denom}.png` — denominations: 1, 5, 25, 100, 500, 1K, 5K, 25K
```
A casino-grade clay poker chip, top-down, 512×512px, transparent background.
Diameter ~440px. Color: {DENOM_COLOR}. Eight evenly-spaced inset stripes around
the rim in cream. Center disc shows the value "{DENOM_LABEL}" in heavy mono
(Geist Mono Bold), flanked by two small {SUIT} pips. Subtle radial bevel:
brighter at top-left, darker at bottom-right. Microtexture: clay-grit, faint scratches.
Micro shadow under chip. NO casino name, NO city, NO real branding.
```

Color guide:
- $1 — bone white
- $5 — vermilion red
- $25 — emerald green
- $100 — slate navy
- $500 — magenta purple
- $1K — brass gold
- $5K — black with gold stripes
- $25K — sapphire blue

### `chips/stack-{n}.png`  (5, 10, 20-chip stacks, side view)
```
A side-view stack of {N} casino chips, slightly off-axis, 512×512px,
transparent background. Mixed denominations, top chip is the headline color.
Crisp edges, soft contact shadow on a felt-like ground (the felt is NOT in the image,
but the shadow softness implies it).
```

---

## 4 · Felt & rail textures

### `textures/felt-emerald.jpg`  (also felt-burgundy, felt-bone, felt-violet)
```
Seamless tileable poker felt texture, 2048×2048px, deep emerald oklch(0.32 0.06 155).
Fine close-cropped wool nap, subtle fiber direction shimmer, faint dust specks.
Photographic, even lighting, no vignette so it tiles. No logo, no center mark.
```

### `textures/rail-mahogany.jpg`
```
Seamless tileable mahogany leather rail texture, 2048×2048px. Tight-grain leather
with hand-stitched seam every 12cm, brass tack heads every 30cm. Color: warm rosewood
oklch(0.22 0.04 35). Slight specular sheen. Ready to map onto a torus around an oval table.
```

### `textures/wood-rail.jpg`
```
Seamless tileable polished walnut wood grain, 2048×2048px, satin lacquer finish,
subtle figured grain. For the outer rail of a high-end card table.
```

---

## 5 · Avatars

### `avatars/avatar-01.png` … `avatar-12.png`
A diverse set of stylized portrait avatars to use as defaults.
```
A stylized 1:1 portrait avatar at 512×512px, transparent background,
torso-up. Subject {VARIATION}. Painterly editorial illustration, limited palette
(2-color silhouette + 1 accent), warm studio rim light. NOT photorealistic.
The avatar should read at 32px. No text, no captions, no UI.

Variations to generate (replace {VARIATION}):
- "an older man with silver hair, wearing a charcoal suit and sunglasses"
- "a young woman with cropped black hair, leather jacket, neutral expression"
- "an older woman with grey braid, cream sweater, kind eyes"
- "a man with a turban and salt-pepper beard, deep navy shirt"
- "a person with shaved head and gold nose ring, olive blazer"
- "a woman in a wide-brim hat, pearl earrings, copper lipstick"
- "a man with red curly hair, freckles, mustard cardigan"
- "a person with platinum bowl cut and round glasses, pastel turtleneck"
- "an elder Asian woman with reading glasses on a chain"
- "a man with locs tied back, white linen shirt, gold chain"
- "a person in a chef's whites, dark eyes, focused expression"
- "an androgynous figure with high cheekbones, black turtleneck"
```

---

## 6 · Lobby & marketing imagery

### `lobby/hero-table.jpg`
```
A wide cinematic photograph of an empty poker table at night, three-quarter view,
dramatic ceiling-spot lighting that pools brass-warm on the felt and falls off into
deep shadow at the rail. Five community cards face-up at center mid-deal, a single
chip stack reflected on the felt. Smoky atmosphere, very shallow depth of field,
85mm lens look. 1920×1080. No people, no logos.
```

### `lobby/tournament-trophy.png`
```
A small, art-deco brass trophy on a black ground, transparent background, 512×512px.
Stylized illustration, two-tone (brass on ink), subtle highlight, elegant and small —
suitable as a tile graphic.
```

### `lobby/heads-up-icon.png`, `omaha-icon.png`, `stud-icon.png`
```
A 256×256 monochrome icon (brass on transparent) representing {VARIANT}.
Hand-drawn engraved feel, single weight stroke, art-deco. Geometric, instantly readable.

Variants:
- heads-up: "two opposing playing-card silhouettes"
- omaha:    "four playing cards in a fan"
- stud:     "seven cards in two rows"
- holdem:   "two pocket cards above a row of five community cards"
```

---

## 7 · Hand strength badges

### `hands/royal-flush.png`, `hands/straight-flush.png`, `hands/quads.png`, …
```
A small 256×128 horizontal badge for the hand "{HAND_NAME}". Brass foil text on
deep oxblood ribbon, pinched ends. Engraved feel, two-tone. No background.
Style consistent across all 10 hand types.
```

---

## 8 · Cashier / chip pack hero shots

### `cashier/pack-{tier}.png` — tiers: starter, pro, high-roller, whale, vault
```
A hero product shot of a stack of casino chips in three tidy columns on a deep
felt surface, photographed from a 25-degree angle, soft top-key light + cool
fill from the left. {TIER_DETAIL} The composition is left-weighted with negative
space at the right for product copy. 1200×900, no text, no logo.

Tier detail:
- starter:     "two short stacks of $5 red and $25 green chips"
- pro:         "four mixed stacks featuring $25, $100 and $500 chips"
- high-roller: "five tall stacks anchored by $1K brass chips, single $5K stripe top"
- whale:       "six stacks dominated by $5K and $25K chips, gilded edges"
- vault:       "a vault of $25K sapphire chips, dramatic side light, high contrast"
```

---

## 9 · Sounds (optional)

If you want SFX too, here are prompts for AI audio (e.g. ElevenLabs Sound Effects):

```
- "Single playing card slid across smooth felt, sharp release, ~250ms"
- "Two clay chips clinking together, dry, mid-frequency, ~300ms"
- "Stack of 8 chips falling onto felt, soft thud cluster, ~600ms"
- "Soft dealer chime — single bright glockenspiel ding, ~400ms"
- "Velvet curtain whoosh, dramatic, ~700ms — for big-pot reveal"
- "Crowd murmur in a quiet card room, looping ambient ~30s"
- "Coin counter, mechanical clicks accelerating then settling, ~1.2s"
```

---

## File tree (drop your assets here)

```
assets/
├── logo-fb.svg
├── logo-fb-mark.svg
├── cards/
│   ├── back.png
│   ├── A-s.png … 2-c.png       (52 files)
├── chips/
│   ├── 1.png, 5.png, 25.png, 100.png, 500.png, 1K.png, 5K.png, 25K.png
│   ├── stack-5.png, stack-10.png, stack-20.png
├── textures/
│   ├── felt-emerald.jpg, felt-burgundy.jpg, felt-bone.jpg, felt-violet.jpg
│   ├── rail-mahogany.jpg, wood-rail.jpg
├── avatars/
│   └── avatar-01.png … avatar-12.png
├── lobby/
│   ├── hero-table.jpg
│   ├── tournament-trophy.png
│   └── (variant icons)
├── hands/
│   └── royal-flush.png, straight-flush.png, … high-card.png
├── cashier/
│   └── pack-starter.png, pack-pro.png, pack-high-roller.png, pack-whale.png, pack-vault.png
└── sfx/
    └── (optional)
```

When you upload these, I'll wire them in by editing each component to point at the file path instead of the CSS placeholder. The card and chip components are already structured so swap-in is a one-line change.
