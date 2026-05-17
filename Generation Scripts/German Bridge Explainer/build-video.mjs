import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");
const voiceoverPath = path.join(
  projectRoot,
  "Project Assets",
  "Voiceovers",
  "German Bridge Explainer Narration 90s.mp3",
);
const outputDir = path.join(projectRoot, "Project Assets", "Videos");
const renderDir = path.join(scriptDir, ".render");
const cardDir = path.join(projectRoot, "public", "card-art", "standard-bordered");
const woodPath = path.join(projectRoot, "public", "textures", "wood025-rail.jpg");

const FPS = 24;

const formats = [
  {
    name: "landscape",
    width: 1920,
    height: 1080,
    output: "German Bridge Rules Explainer Landscape.mp4",
  },
  {
    name: "vertical",
    width: 1080,
    height: 1920,
    output: "German Bridge Rules Explainer Vertical.mp4",
  },
];

const scenes = [
  {
    key: "title",
    weight: 7,
    kicker: "German Bridge",
    title: "Bid exact. Take control.",
    caption: "German Bridge is a trick-taking card game where the goal is simple: predict exactly how many tricks you will win.",
  },
  {
    key: "setup",
    weight: 9,
    kicker: "1. Set the hand",
    title: "Players, decks, tricks",
    caption: "At the start, choose the number of players, decks, and tricks per hand.",
  },
  {
    key: "trump",
    weight: 9,
    kicker: "2. Deal and flip trump",
    title: "One flipped card sets trump",
    caption: "The cards are dealt, and one extra card is flipped face up. Its suit becomes trump.",
  },
  {
    key: "bid",
    weight: 12,
    kicker: "3. Bid",
    title: "Predict your tricks",
    caption: "Your bid is the number of tricks you think you can take this hand.",
  },
  {
    key: "lastBidder",
    weight: 12,
    kicker: "The twist",
    title: "The final bid cannot balance",
    caption: "The last bidder cannot make the total bids equal the total tricks, so someone must be wrong.",
  },
  {
    key: "play",
    weight: 13,
    kicker: "4. Play cards",
    title: "Follow suit if you can",
    caption: "The first player leads a card. Everyone else must follow the lead suit if they can.",
  },
  {
    key: "trumpWins",
    weight: 12,
    kicker: "Winning a trick",
    title: "Trump beats the lead suit",
    caption: "The highest lead-suit card wins unless trump is played. With duplicate cards, the later identical card wins.",
  },
  {
    key: "leadNext",
    weight: 8,
    kicker: "5. Keep going",
    title: "Winner leads next",
    caption: "Each trick winner leads the next trick. Keep going until every card has been played.",
  },
  {
    key: "scoring",
    weight: 12,
    kicker: "6. Score",
    title: "Exact bids score big",
    caption: "Make your bid exactly to score ten plus won squared. Miss your bid and lose the squared difference.",
  },
  {
    key: "recap",
    weight: 6,
    kicker: "German Bridge",
    title: "Bid exact. Follow suit. Respect trump.",
    caption: "Read your hand, make the right bid, and try to take exactly what you promised.",
  },
];

const totalWeight = scenes.reduce((sum, scene) => sum + scene.weight, 0);

const cardFiles = {
  aceSpades: "SPADE-1.svg",
  kingHearts: "HEART-13-KING.svg",
  queenHearts: "HEART-12-QUEEN.svg",
  tenSpades: "SPADE-10.svg",
  tenSpadesLater: "SPADE-10.svg",
  sevenClubs: "CLUB-7.svg",
  threeDiamonds: "DIAMOND-3.svg",
  fiveSpades: "SPADE-5.svg",
  nineHearts: "HEART-9.svg",
  queenClubs: "CLUB-12-QUEEN.svg",
};

function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function audioDuration(filePath) {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nk=1:nw=1",
    filePath,
  ], { encoding: "utf8" });
  return Number.parseFloat(out.trim());
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function ease(t) {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function splitWords(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current += ` ${word}`;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function textBlock({
  text,
  x,
  y,
  width,
  size,
  color = "#f9f4e8",
  weight = 500,
  anchor = "start",
  lineHeight = 1.18,
  opacity = 1,
  maxLines = 4,
}) {
  const approx = Math.max(10, Math.floor(width / (size * 0.55)));
  const lines = splitWords(text, approx).slice(0, maxLines);
  const dy = size * lineHeight;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" opacity="${opacity}" font-size="${size}" font-weight="${weight}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif">${lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : dy}">${esc(line)}</tspan>`)
    .join("")}</text>`;
}

function pill(x, y, w, h, label, value, accent = "#d6b774") {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="rgba(7,18,14,0.78)" stroke="rgba(246,226,178,0.22)" stroke-width="1.5"/>
    <text x="${x + 24}" y="${y + h / 2 - 4}" fill="#bfb8a7" font-size="${h * 0.22}" font-weight="700" letter-spacing="2" font-family="-apple-system, BlinkMacSystemFont, Arial">${esc(label.toUpperCase())}</text>
    <text x="${x + w - 24}" y="${y + h / 2 + 10}" text-anchor="end" fill="${accent}" font-size="${h * 0.38}" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Arial">${esc(value)}</text>
  `;
}

function cardBack(x, y, w, rot = 0, opacity = 1) {
  const h = w * 1.397;
  return `
    <g transform="translate(${x} ${y}) rotate(${rot} ${w / 2} ${h / 2})" opacity="${opacity}">
      <rect width="${w}" height="${h}" rx="${w * 0.08}" fill="#e9dfc6"/>
      <rect x="${w * 0.07}" y="${w * 0.07}" width="${w * 0.86}" height="${h - w * 0.14}" rx="${w * 0.055}" fill="#173a30" stroke="#d3b066" stroke-width="${w * 0.025}"/>
      <path d="M ${w * 0.5} ${h * 0.24} C ${w * 0.72} ${h * 0.36}, ${w * 0.72} ${h * 0.64}, ${w * 0.5} ${h * 0.76} C ${w * 0.28} ${h * 0.64}, ${w * 0.28} ${h * 0.36}, ${w * 0.5} ${h * 0.24} Z" fill="none" stroke="rgba(246,226,178,0.45)" stroke-width="${w * 0.035}"/>
      <circle cx="${w * 0.5}" cy="${h * 0.5}" r="${w * 0.14}" fill="rgba(246,226,178,0.13)" stroke="rgba(246,226,178,0.3)" stroke-width="${w * 0.02}"/>
    </g>
  `;
}

function cardImage(card, x, y, w, rot = 0, opacity = 1, glow = false) {
  const h = w * 1.397;
  return `
    <g transform="translate(${x} ${y}) rotate(${rot} ${w / 2} ${h / 2})" opacity="${opacity}">
      ${glow ? `<rect x="${-w * 0.08}" y="${-w * 0.08}" width="${w * 1.16}" height="${h + w * 0.16}" rx="${w * 0.12}" fill="rgba(216,183,116,0.22)" filter="url(#softGlow)"/>` : ""}
      <rect x="${w * 0.035}" y="${w * 0.055}" width="${w * 0.96}" height="${h * 0.96}" rx="${w * 0.075}" fill="rgba(0,0,0,0.22)" filter="url(#shadow)"/>
      <image href="${card}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>
    </g>
  `;
}

function layout(width, height) {
  const vertical = height > width;
  const margin = vertical ? 72 : 96;
  const visualW = vertical ? width - margin * 2 : Math.min(1260, width - margin * 2);
  const visualH = vertical ? 760 : 600;
  return {
    vertical,
    margin,
    centerX: width / 2,
    visualX: (width - visualW) / 2,
    visualY: vertical ? 660 : 278,
    visualW,
    visualH,
    copyY: vertical ? 236 : 156,
    copyW: vertical ? width - margin * 2 : Math.min(1220, width - margin * 2),
  };
}

function sceneAt(time, duration) {
  const target = (time / duration) * totalWeight;
  let cursor = 0;
  for (let i = 0; i < scenes.length; i += 1) {
    const next = cursor + scenes[i].weight;
    if (target <= next || i === scenes.length - 1) {
      return {
        scene: scenes[i],
        index: i,
        progress: clamp((target - cursor) / scenes[i].weight),
      };
    }
    cursor = next;
  }
  return { scene: scenes[scenes.length - 1], index: scenes.length - 1, progress: 1 };
}

function sceneCopy(scene, p, l) {
  const enter = ease(clamp(p / 0.18));
  const y = l.copyY + lerp(18, 0, enter);
  const titleSize = l.vertical ? 56 : 64;
  return `
    <g opacity="${enter}">
      <text x="${l.centerX}" y="${y}" text-anchor="middle" fill="#d6b774" font-size="${l.vertical ? 24 : 21}" font-weight="800" letter-spacing="3" font-family="-apple-system, BlinkMacSystemFont, Arial">${esc(scene.kicker.toUpperCase())}</text>
      ${textBlock({
        text: scene.title,
        x: l.centerX,
        y: y + (l.vertical ? 78 : 82),
        width: l.copyW,
        size: titleSize,
        weight: 850,
        anchor: "middle",
        maxLines: l.vertical ? 3 : 2,
      })}
    </g>
  `;
}

function stageFrame(x, y, w, h) {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(42, w * 0.04)}" fill="rgba(4,20,15,0.68)" stroke="rgba(246,226,178,0.16)" stroke-width="2"/>
    <ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w * 0.42}" ry="${h * 0.35}" fill="rgba(13,80,58,0.38)" stroke="rgba(246,226,178,0.18)" stroke-width="3"/>
    <ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w * 0.34}" ry="${h * 0.27}" fill="rgba(4,39,29,0.8)" stroke="rgba(255,255,255,0.06)" stroke-width="2"/>
  `;
}

function renderTitle(p, l, assets) {
  const x = l.visualX;
  const y = l.visualY;
  const w = l.visualW;
  const h = l.visualH;
  const cardW = l.vertical ? 176 : 156;
  const cx = x + w / 2;
  const cy = y + h * (l.vertical ? 0.48 : 0.5);
  const rise = ease(p);
  const cards = [
    [assets.cards.aceSpades, -1.25, -18],
    [assets.cards.kingHearts, -0.45, -6],
    [assets.cards.queenClubs, 0.42, 7],
    [assets.cards.tenSpades, 1.18, 18],
  ];
  return `
    ${stageFrame(x, y, w, h)}
    <g transform="translate(0 ${lerp(36, 0, rise)})">
      ${cards.map(([card, offset, rot], i) => cardImage(card, cx - cardW / 2 + offset * cardW * 0.42, cy - cardW * 0.72 + Math.sin(p * Math.PI + i) * 14, cardW, rot, 0.98)).join("")}
    </g>
    <text x="${cx}" y="${cy + cardW * 1.25}" text-anchor="middle" fill="#f9f4e8" font-size="${l.vertical ? 54 : 52}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">German Bridge</text>
    <text x="${cx}" y="${cy + cardW * 1.6}" text-anchor="middle" fill="#d6b774" font-size="${l.vertical ? 27 : 24}" font-weight="750" font-family="-apple-system, BlinkMacSystemFont, Arial">A fast guide for first-time players</text>
  `;
}

function renderSetup(p, l) {
  const { visualX: x, visualY: y, visualW: w, visualH: h } = l;
  const knobs = [
    ["Players", "4", "#d6b774"],
    ["Decks", "2", "#76d3aa"],
    ["Tricks per hand", "8", "#e8d9a4"],
  ];
  const cardW = l.vertical ? w : w * 0.86;
  const panelX = x + (w - cardW) / 2;
  const panelY = y + h * 0.18;
  return `
    ${stageFrame(x, y, w, h)}
    <rect x="${panelX}" y="${panelY}" width="${cardW}" height="${h * 0.52}" rx="34" fill="rgba(9,29,23,0.9)" stroke="rgba(246,226,178,0.18)" stroke-width="2"/>
    <text x="${panelX + 42}" y="${panelY + 72}" fill="#d6b774" font-size="${l.vertical ? 24 : 20}" font-weight="800" letter-spacing="3" font-family="-apple-system, BlinkMacSystemFont, Arial">MATCH SETUP</text>
    ${knobs.map((knob, i) => {
      const kx = panelX + 42 + i * (cardW - 84) / 3;
      const kw = (cardW - 126) / 3;
      const ky = panelY + 120;
      const on = ease(clamp((p - i * 0.12) / 0.42));
      return `
        <g opacity="${on}" transform="translate(0 ${lerp(26, 0, on)})">
          <rect x="${kx}" y="${ky}" width="${kw}" height="${l.vertical ? 210 : 180}" rx="28" fill="rgba(255,255,255,0.055)" stroke="rgba(255,255,255,0.08)"/>
          <text x="${kx + 24}" y="${ky + 46}" fill="#beb7a5" font-size="${l.vertical ? 23 : 18}" font-weight="750" font-family="-apple-system, BlinkMacSystemFont, Arial">${esc(knob[0])}</text>
          <text x="${kx + kw / 2}" y="${ky + (l.vertical ? 142 : 128)}" text-anchor="middle" fill="${knob[2]}" font-size="${l.vertical ? 82 : 70}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">${knob[1]}</text>
        </g>`;
    }).join("")}
    <text x="${x + w / 2}" y="${panelY + h * 0.52 + 72}" text-anchor="middle" fill="#f7eed9" font-size="${l.vertical ? 38 : 32}" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Arial">Then deal one hand.</text>
  `;
}

function renderTrump(p, l, assets) {
  const { visualX: x, visualY: y, visualW: w, visualH: h } = l;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const spread = ease(clamp(p / 0.65));
  const cardW = l.vertical ? 128 : 112;
  const trumpW = l.vertical ? 210 : 184;
  const dealPoints = [
    [-w * 0.3, -h * 0.22, -16],
    [w * 0.26, -h * 0.2, 13],
    [-w * 0.26, h * 0.22, 14],
    [w * 0.3, h * 0.2, -11],
  ];
  return `
    ${stageFrame(x, y, w, h)}
    ${dealPoints.map(([dx, dy, rot], i) => cardBack(cx - cardW / 2 + dx * spread, cy - cardW * 0.7 + dy * spread, cardW, rot * spread, 0.94)).join("")}
    <g transform="translate(0 ${lerp(42, 0, ease(clamp((p - 0.25) / 0.55)))})">
      ${cardImage(assets.cards.queenHearts, cx - trumpW / 2, cy - trumpW * 0.8, trumpW, lerp(10, 0, ease(p)), ease(clamp((p - 0.18) / 0.55)), true)}
    </g>
    <rect x="${cx - 150}" y="${cy + trumpW * 0.72}" width="300" height="64" rx="32" fill="rgba(95,24,34,0.74)" stroke="rgba(255,255,255,0.12)"/>
    <text x="${cx}" y="${cy + trumpW * 0.72 + 42}" text-anchor="middle" fill="#ffd9d5" font-size="${l.vertical ? 30 : 27}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">Hearts are trump</text>
  `;
}

function renderBid(p, l) {
  const { visualX: x, visualY: y, visualW: w, visualH: h } = l;
  const cx = x + w / 2;
  const panelW = l.vertical ? w * 0.86 : w * 0.74;
  const panelX = cx - panelW / 2;
  const panelY = y + h * 0.2;
  const panelH = l.vertical ? h * 0.66 : h * 0.58;
  const chipSize = l.vertical ? 78 : 64;
  const chipGap = l.vertical ? 16 : 14;
  const chipY = l.vertical ? 178 : 172;
  const submitY = l.vertical ? panelY + 398 : panelY + h * 0.45;
  const chips = ["0", "1", "2", "3", "4", "5", "6", "7", "8"];
  return `
    ${stageFrame(x, y, w, h)}
    <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="36" fill="rgba(8,26,20,0.92)" stroke="rgba(246,226,178,0.16)" stroke-width="2"/>
    <text x="${panelX + 42}" y="${panelY + 70}" fill="#d6b774" font-size="${l.vertical ? 24 : 20}" font-weight="800" letter-spacing="3" font-family="-apple-system, BlinkMacSystemFont, Arial">YOUR BID</text>
    <text x="${panelX + 42}" y="${panelY + 124}" fill="#f9f4e8" font-size="${l.vertical ? 44 : 38}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">How many tricks?</text>
    <g transform="translate(${panelX + 42} ${panelY + chipY})">
      ${chips.map((chip, i) => {
        const row = l.vertical && i > 4 ? 1 : 0;
        const col = l.vertical ? i % 5 : i;
        const size = chipSize;
        const gap = chipGap;
        const on = chip === "2";
        const delay = ease(clamp((p - i * 0.025) / 0.35));
        return `
          <g opacity="${delay}" transform="translate(${col * (size + gap)} ${row * (size + gap + 12)}) scale(${lerp(0.82, 1, delay)})">
            <rect width="${size}" height="${size}" rx="${size / 2}" fill="${on ? "#d6b774" : "rgba(255,255,255,0.06)"}" stroke="${on ? "#f6e2b2" : "rgba(255,255,255,0.13)"}" stroke-width="2"/>
            <text x="${size / 2}" y="${size / 2 + size * 0.18}" text-anchor="middle" fill="${on ? "#14251d" : "#f7eed9"}" font-size="${size * 0.44}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">${chip}</text>
          </g>`;
      }).join("")}
    </g>
    <rect x="${panelX + 42}" y="${submitY}" width="${panelW - 84}" height="72" rx="36" fill="rgba(214,183,116,0.15)"/>
    <text x="${cx}" y="${submitY + 47}" text-anchor="middle" fill="#f6e2b2" font-size="${l.vertical ? 31 : 27}" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Arial">You bid 2 tricks</text>
  `;
}

function renderLastBidder(p, l) {
  const { visualX: x, visualY: y, visualW: w, visualH: h } = l;
  const cx = x + w / 2;
  const y0 = y + h * 0.28;
  const big = l.vertical ? 74 : 64;
  const disabled = ease(clamp((p - 0.42) / 0.32));
  return `
    ${stageFrame(x, y, w, h)}
    <text x="${cx}" y="${y0}" text-anchor="middle" fill="#f9f4e8" font-size="${big}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">2 + 1 + 3 + ?</text>
    <text x="${cx}" y="${y0 + big * 0.92}" text-anchor="middle" fill="#d7d0bf" font-size="${l.vertical ? 32 : 28}" font-weight="650" font-family="-apple-system, BlinkMacSystemFont, Arial">8 tricks available</text>
    <g transform="translate(${cx - (l.vertical ? 275 : 245)} ${y0 + big * 1.7})">
      ${["0", "1", "2", "3", "4"].map((n, i) => {
        const blocked = n === "2";
        const size = l.vertical ? 96 : 84;
        return `
          <g transform="translate(${i * (size + 18)} 0)">
            <rect width="${size}" height="${size}" rx="${size / 2}" fill="${blocked ? "rgba(124,32,44,0.82)" : "rgba(255,255,255,0.065)"}" stroke="${blocked ? "rgba(255,170,150,0.7)" : "rgba(255,255,255,0.14)"}" stroke-width="2"/>
            <text x="${size / 2}" y="${size / 2 + size * 0.18}" text-anchor="middle" fill="${blocked ? "#ffd6cf" : "#f7eed9"}" font-size="${size * 0.43}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">${n}</text>
            ${blocked ? `<path d="M ${size * 0.25} ${size * 0.25} L ${size * 0.75} ${size * 0.75}" stroke="#ffd6cf" stroke-width="7" stroke-linecap="round" opacity="${disabled}"/>` : ""}
          </g>`;
      }).join("")}
    </g>
    <rect x="${cx - (l.vertical ? 345 : 310)}" y="${y0 + big * 3.3}" width="${l.vertical ? 690 : 620}" height="${l.vertical ? 88 : 76}" rx="38" fill="rgba(124,32,44,0.46)" stroke="rgba(255,170,150,0.22)"/>
    <text x="${cx}" y="${y0 + big * 3.3 + (l.vertical ? 55 : 49)}" text-anchor="middle" fill="#ffd6cf" font-size="${l.vertical ? 31 : 27}" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Arial">Total bids cannot equal total tricks</text>
  `;
}

function renderPlay(p, l, assets) {
  const { visualX: x, visualY: y, visualW: w, visualH: h } = l;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const cardW = l.vertical ? 136 : 124;
  const cards = [
    [assets.cards.aceSpades, -1.35, -0.1, -10, "Lead suit"],
    [assets.cards.fiveSpades, -0.44, 0.03, 5, "Follow"],
    [assets.cards.tenSpades, 0.44, -0.04, -4, "Follow"],
    [assets.cards.sevenClubs, 1.35, 0.08, 10, "No spade"],
  ];
  return `
    ${stageFrame(x, y, w, h)}
    ${cards.map(([card, ox, oy, rot, label], i) => {
      const enter = ease(clamp((p - i * 0.13) / 0.35));
      const tx = cx - cardW / 2 + ox * cardW * 0.92;
      const ty = cy - cardW * 0.72 + oy * cardW + lerp(60, 0, enter);
      return `
        <g opacity="${enter}">
          ${cardImage(card, tx, ty, cardW, rot, 1, i === 0)}
          <text x="${tx + cardW / 2}" y="${ty + cardW * 1.56}" text-anchor="middle" fill="${i === 3 ? "#d7d0bf" : "#d6b774"}" font-size="${l.vertical ? 25 : 22}" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Arial">${esc(label)}</text>
        </g>`;
    }).join("")}
    <text x="${cx}" y="${y + h * 0.83}" text-anchor="middle" fill="#f9f4e8" font-size="${l.vertical ? 36 : 32}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">Follow the lead suit if you can.</text>
  `;
}

function renderTrumpWins(p, l, assets) {
  const { visualX: x, visualY: y, visualW: w, visualH: h } = l;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const cardW = l.vertical ? 132 : 122;
  const glow = ease(clamp((p - 0.28) / 0.34));
  return `
    ${stageFrame(x, y, w, h)}
    ${cardImage(assets.cards.aceSpades, cx - cardW * 1.75, cy - cardW * 0.65, cardW, -10, 1)}
    ${cardImage(assets.cards.tenSpades, cx - cardW * 0.6, cy - cardW * 0.7, cardW, 3, 1)}
    ${cardImage(assets.cards.tenSpadesLater, cx + cardW * 0.52, cy - cardW * 0.62, cardW, 8, 1)}
    ${cardImage(assets.cards.nineHearts, cx + cardW * 1.5, cy - cardW * 0.76 - 24 * glow, cardW, 12, 1, true)}
    <path d="M ${cx + cardW * 1.98} ${cy - cardW * 0.93} C ${cx + cardW * 2.5} ${cy - cardW * 1.45}, ${cx + cardW * 2.5} ${cy - cardW * 0.15}, ${cx + cardW * 1.98} ${cy + cardW * 0.34}" fill="none" stroke="rgba(216,183,116,${0.35 + glow * 0.4})" stroke-width="7" stroke-linecap="round"/>
    <rect x="${cx - (l.vertical ? 360 : 330)}" y="${y + h * 0.72}" width="${l.vertical ? 720 : 660}" height="${l.vertical ? 138 : 118}" rx="38" fill="rgba(8,26,20,0.88)" stroke="rgba(246,226,178,0.16)"/>
    <text x="${cx}" y="${y + h * 0.72 + (l.vertical ? 52 : 46)}" text-anchor="middle" fill="#f9f4e8" font-size="${l.vertical ? 32 : 29}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">Trump wins the trick.</text>
    <text x="${cx}" y="${y + h * 0.72 + (l.vertical ? 98 : 84)}" text-anchor="middle" fill="#d7d0bf" font-size="${l.vertical ? 24 : 22}" font-weight="650" font-family="-apple-system, BlinkMacSystemFont, Arial">Duplicate card? Later-played identical card wins.</text>
  `;
}

function renderLeadNext(p, l) {
  const { visualX: x, visualY: y, visualW: w, visualH: h } = l;
  const cx = x + w / 2;
  const panelW = l.vertical ? w * 0.82 : w * 0.7;
  const panelX = cx - panelW / 2;
  const panelY = y + h * 0.17;
  const progress = 0.62 + Math.sin(p * Math.PI) * 0.05;
  return `
    ${stageFrame(x, y, w, h)}
    <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${h * 0.62}" rx="34" fill="rgba(8,26,20,0.92)" stroke="rgba(246,226,178,0.16)" stroke-width="2"/>
    <text x="${panelX + 38}" y="${panelY + 62}" fill="#d6b774" font-size="${l.vertical ? 23 : 20}" font-weight="800" letter-spacing="3" font-family="-apple-system, BlinkMacSystemFont, Arial">PLAYED CARDS</text>
    ${[["Trick 1", "Margot wins", "#d6b774"], ["Trick 2", "You lead next", "#76d3aa"], ["Trick 3", "In play", "#d7d0bf"]].map((row, i) => {
      const ry = panelY + 110 + i * (l.vertical ? 128 : 104);
      const on = ease(clamp((p - i * 0.12) / 0.38));
      return `
        <g opacity="${on}" transform="translate(0 ${lerp(28, 0, on)})">
          <rect x="${panelX + 34}" y="${ry}" width="${panelW - 68}" height="${l.vertical ? 94 : 78}" rx="24" fill="rgba(255,255,255,0.055)" stroke="rgba(255,255,255,0.08)"/>
          <text x="${panelX + 66}" y="${ry + (l.vertical ? 57 : 50)}" fill="#f7eed9" font-size="${l.vertical ? 30 : 26}" font-weight="820" font-family="-apple-system, BlinkMacSystemFont, Arial">${row[0]}</text>
          <text x="${panelX + panelW - 66}" y="${ry + (l.vertical ? 57 : 50)}" text-anchor="end" fill="${row[2]}" font-size="${l.vertical ? 27 : 24}" font-weight="780" font-family="-apple-system, BlinkMacSystemFont, Arial">${row[1]}</text>
        </g>`;
    }).join("")}
    <rect x="${panelX + 42}" y="${panelY + h * 0.52}" width="${panelW - 84}" height="18" rx="9" fill="rgba(255,255,255,0.1)"/>
    <rect x="${panelX + 42}" y="${panelY + h * 0.52}" width="${(panelW - 84) * progress}" height="18" rx="9" fill="#d6b774"/>
    <text x="${cx}" y="${panelY + h * 0.52 + 62}" text-anchor="middle" fill="#d7d0bf" font-size="${l.vertical ? 26 : 23}" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, Arial">Play until every card is gone.</text>
  `;
}

function renderScoring(p, l) {
  const { visualX: x, visualY: y, visualW: w, visualH: h } = l;
  const cx = x + w / 2;
  const top = y + h * 0.16;
  const cardW = l.vertical ? w * 0.86 : w * 0.78;
  const px = cx - cardW / 2;
  const rowH = l.vertical ? 156 : 128;
  const exactOn = ease(clamp((p - 0.1) / 0.32));
  const missOn = ease(clamp((p - 0.45) / 0.32));
  return `
    ${stageFrame(x, y, w, h)}
    <g opacity="${exactOn}" transform="translate(0 ${lerp(34, 0, exactOn)})">
      <rect x="${px}" y="${top}" width="${cardW}" height="${rowH}" rx="32" fill="rgba(19,78,56,0.75)" stroke="rgba(118,211,170,0.24)" stroke-width="2"/>
      <text x="${px + 34}" y="${top + rowH * 0.45}" fill="#baf3d3" font-size="${l.vertical ? 30 : 26}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">Exact bid</text>
      <text x="${px + 34}" y="${top + rowH * 0.74}" fill="#f7eed9" font-size="${l.vertical ? 38 : 34}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">10 + won^2</text>
      <text x="${px + cardW - 34}" y="${top + rowH * 0.66}" text-anchor="end" fill="#76d3aa" font-size="${l.vertical ? 68 : 58}" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, Arial">+14</text>
    </g>
    <g opacity="${missOn}" transform="translate(0 ${lerp(34, 0, missOn)})">
      <rect x="${px}" y="${top + rowH + 28}" width="${cardW}" height="${rowH}" rx="32" fill="rgba(93,28,39,0.72)" stroke="rgba(255,170,150,0.22)" stroke-width="2"/>
      <text x="${px + 34}" y="${top + rowH + 28 + rowH * 0.45}" fill="#ffd1ca" font-size="${l.vertical ? 30 : 26}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">Miss bid</text>
      <text x="${px + 34}" y="${top + rowH + 28 + rowH * 0.74}" fill="#f7eed9" font-size="${l.vertical ? 38 : 34}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">-(bid - won)^2</text>
      <text x="${px + cardW - 34}" y="${top + rowH + 28 + rowH * 0.66}" text-anchor="end" fill="#ffb1a5" font-size="${l.vertical ? 68 : 58}" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, Arial">-4</text>
    </g>
    <text x="${cx}" y="${top + rowH * 2 + (l.vertical ? 150 : 128)}" text-anchor="middle" fill="#d7d0bf" font-size="${l.vertical ? 28 : 25}" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, Arial">Bid 2 and win 2? Score +14. Bid 3 and win 1? Score -4.</text>
  `;
}

function renderRecap(p, l, assets) {
  const { visualX: x, visualY: y, visualW: w, visualH: h } = l;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const cardW = l.vertical ? 142 : 128;
  const items = ["Bid exact", "Follow suit", "Respect trump", "Hit your number"];
  return `
    ${stageFrame(x, y, w, h)}
    ${cardImage(assets.cards.aceSpades, cx - cardW * 1.22, cy - cardW * 1.12, cardW, -8, 0.96)}
    ${cardImage(assets.cards.queenHearts, cx - cardW * 0.34, cy - cardW * 1.2, cardW, 3, 0.98, true)}
    ${cardImage(assets.cards.kingHearts, cx + cardW * 0.54, cy - cardW * 1.1, cardW, 9, 0.96)}
    <g transform="translate(${cx - (l.vertical ? 360 : 330)} ${cy + cardW * 0.65})">
      ${items.map((item, i) => {
        const row = l.vertical ? i : Math.floor(i / 2);
        const col = l.vertical ? 0 : i % 2;
        const bw = l.vertical ? 720 : 310;
        const bh = l.vertical ? 78 : 72;
        const on = ease(clamp((p - i * 0.08) / 0.35));
        return `
          <g opacity="${on}" transform="translate(${col * 350} ${row * (bh + 20)})">
            <rect width="${bw}" height="${bh}" rx="${bh / 2}" fill="rgba(214,183,116,0.16)" stroke="rgba(246,226,178,0.18)"/>
            <circle cx="${bh / 2}" cy="${bh / 2}" r="${bh * 0.28}" fill="#d6b774"/>
            <text x="${bh / 2}" y="${bh / 2 + 9}" text-anchor="middle" fill="#10241b" font-size="${bh * 0.34}" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, Arial">${i + 1}</text>
            <text x="${bh + 22}" y="${bh / 2 + 10}" fill="#f9f4e8" font-size="${l.vertical ? 31 : 27}" font-weight="850" font-family="-apple-system, BlinkMacSystemFont, Arial">${esc(item)}</text>
          </g>`;
      }).join("")}
    </g>
  `;
}

function renderScene(scene, p, l, assets) {
  switch (scene.key) {
    case "title":
      return renderTitle(p, l, assets);
    case "setup":
      return renderSetup(p, l);
    case "trump":
      return renderTrump(p, l, assets);
    case "bid":
      return renderBid(p, l);
    case "lastBidder":
      return renderLastBidder(p, l);
    case "play":
      return renderPlay(p, l, assets);
    case "trumpWins":
      return renderTrumpWins(p, l, assets);
    case "leadNext":
      return renderLeadNext(p, l);
    case "scoring":
      return renderScoring(p, l);
    case "recap":
      return renderRecap(p, l, assets);
    default:
      return "";
  }
}

function caption(scene, l, width, height) {
  const captionW = l.vertical ? width - l.margin * 2 : Math.min(1180, width - l.margin * 2);
  const x = (width - captionW) / 2;
  const h = l.vertical ? 190 : 104;
  const y = height - h - (l.vertical ? 48 : 38);
  const size = l.vertical ? 29 : 25;
  return `
    <rect x="${x}" y="${y}" width="${captionW}" height="${h}" rx="${l.vertical ? 34 : 28}" fill="rgba(5,13,11,0.82)" stroke="rgba(246,226,178,0.12)" stroke-width="1.5"/>
    ${textBlock({
      text: scene.caption,
      x: x + captionW / 2,
      y: y + (l.vertical ? 58 : 42),
      width: captionW - 84,
      size,
      color: "#f7eed9",
      weight: 720,
      anchor: "middle",
      lineHeight: 1.28,
      maxLines: l.vertical ? 3 : 2,
    })}
  `;
}

function progressBar(time, duration, width, height, l) {
  const barW = width - l.margin * 2;
  const barH = 8;
  const x = l.margin;
  const y = height - 18;
  return `
    <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="${barH / 2}" fill="rgba(255,255,255,0.12)"/>
    <rect x="${x}" y="${y}" width="${barW * clamp(time / duration)}" height="${barH}" rx="${barH / 2}" fill="#d6b774"/>
  `;
}

function svgFrame({ width, height, time, duration, assets }) {
  const { scene, progress } = sceneAt(time, duration);
  const l = layout(width, height);
  const visualProgress = clamp(0.12 + progress * 0.88);
  const visual = renderScene(scene, visualProgress, l, assets);
  const copy = sceneCopy(scene, progress, l);
  const woodHref = assets.wood;
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <radialGradient id="vignette" cx="50%" cy="45%" r="72%">
        <stop offset="0%" stop-color="#1f4e3d" stop-opacity="0.38"/>
        <stop offset="58%" stop-color="#0b1713" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="#020705" stop-opacity="0.92"/>
      </radialGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="16" stdDeviation="14" flood-color="#000000" flood-opacity="0.34"/>
      </filter>
      <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="18"/>
      </filter>
      <pattern id="grain" width="120" height="120" patternUnits="userSpaceOnUse">
        <rect width="120" height="120" fill="transparent"/>
        <circle cx="16" cy="22" r="1.1" fill="rgba(255,255,255,0.055)"/>
        <circle cx="88" cy="54" r="0.9" fill="rgba(255,255,255,0.045)"/>
        <circle cx="44" cy="96" r="1" fill="rgba(0,0,0,0.14)"/>
      </pattern>
    </defs>
    <rect width="${width}" height="${height}" fill="#07110e"/>
    <image href="${woodHref}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.22"/>
    <rect width="${width}" height="${height}" fill="url(#vignette)"/>
    <rect width="${width}" height="${height}" fill="url(#grain)" opacity="0.8"/>
    <text x="${width / 2}" y="${l.vertical ? 86 : 64}" text-anchor="middle" fill="#d6b774" opacity="0.76" font-size="${l.vertical ? 22 : 17}" font-weight="800" letter-spacing="4" font-family="-apple-system, BlinkMacSystemFont, Arial">GERMAN BRIDGE RULES</text>
    ${copy}
    ${visual}
    ${caption(scene, l, width, height)}
    ${progressBar(time, duration, width, height, l)}
  </svg>`;
}

async function pngDataUri(filePath, width = 640) {
  const buffer = await sharp(filePath)
    .resize({ width, withoutEnlargement: false })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function loadAssets() {
  const cards = {};
  await Promise.all(Object.entries(cardFiles).map(async ([key, file]) => {
    cards[key] = await pngDataUri(path.join(cardDir, file), 720);
  }));
  const wood = existsSync(woodPath)
    ? `data:image/jpeg;base64,${(await readFile(woodPath)).toString("base64")}`
    : "";
  return { cards, wood };
}

async function renderFrames(format, duration, assets) {
  const frameDir = path.join(renderDir, format.name);
  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });
  const frameCount = Math.ceil(duration * FPS);
  const concurrency = 4;
  let nextFrame = 0;

  async function worker() {
    while (nextFrame < frameCount) {
      const frame = nextFrame;
      nextFrame += 1;
      const time = Math.min(duration, frame / FPS);
      const svg = svgFrame({
        width: format.width,
        height: format.height,
        time,
        duration,
        assets,
      });
      const file = path.join(frameDir, `${format.name}_${String(frame).padStart(5, "0")}.png`);
      await sharp(Buffer.from(svg)).png().toFile(file);
      if (frame % Math.max(1, Math.floor(frameCount / 10)) === 0) {
        process.stdout.write(`${format.name}: ${Math.round((frame / frameCount) * 100)}%\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { frameDir, frameCount };
}

async function composeVideo(format, frameDir) {
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, format.output);
  await exec("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    String(FPS),
    "-i",
    path.join(frameDir, `${format.name}_%05d.png`),
    "-i",
    voiceoverPath,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "18",
    "-preset",
    "medium",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
  return outputPath;
}

async function main() {
  if (!existsSync(voiceoverPath)) {
    throw new Error(`Missing narration file: ${voiceoverPath}`);
  }

  await mkdir(renderDir, { recursive: true });
  const duration = audioDuration(voiceoverPath);
  const assets = await loadAssets();
  const formatArg = process.argv.find((arg) => arg.startsWith("--format="));
  const requestedFormat = formatArg ? formatArg.split("=")[1] : null;
  const selectedFormats = requestedFormat
    ? formats.filter((format) => format.name === requestedFormat)
    : formats;
  if (selectedFormats.length === 0) {
    throw new Error(`Unknown format: ${requestedFormat}`);
  }

  console.log(`Narration duration: ${duration.toFixed(2)}s`);
  for (const format of selectedFormats) {
    console.log(`Rendering ${format.name} ${format.width}x${format.height}`);
    const { frameDir } = await renderFrames(format, duration, assets);
    const outputPath = await composeVideo(format, frameDir);
    console.log(`Wrote ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
