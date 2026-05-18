import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { MAX_DECKS, maxTricks } from "../src/lib/cards";
import { ensureProfile, requireUserId } from "./lib/users";

const DEFAULT_SETTINGS = {
  theme: "emerald" as const,
  cardBack: "classic" as const,
  layout: "salon" as const,
  showTrumpHints: true,
  animations: true,
  defaultPlayers: 4,
  defaultDecks: 2,
  defaultStartingTricksPerHand: 1,
  defaultTricksPerHand: 10,
  defaultBotMood: "mixed" as const,
};

const theme = v.union(v.literal("emerald"), v.literal("midnight"), v.literal("graphite"));
const cardBack = v.union(v.literal("classic"), v.literal("lattice"), v.literal("monogram"));
const layout = v.union(v.literal("salon"), v.literal("pad"));
const botMood = v.union(
  v.literal("cautious"),
  v.literal("mixed"),
  v.literal("aggressive"),
  v.literal("champion"),
  v.literal("gpt"),
  v.literal("gemini"),
);

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function sanitizeMatchDefaults(players: number, decks: number, startingTricks: number | undefined, tricks: number) {
  const defaultPlayers = clampInt(players, 3, 12);
  const defaultDecks = clampInt(decks, 1, MAX_DECKS);
  const defaultTricksPerHand = clampInt(
    tricks,
    1,
    Math.max(1, maxTricks(defaultPlayers, defaultDecks)),
  );
  const defaultStartingTricksPerHand = clampInt(
    startingTricks ?? DEFAULT_SETTINGS.defaultStartingTricksPerHand,
    1,
    defaultTricksPerHand,
  );
  return { defaultPlayers, defaultDecks, defaultStartingTricksPerHand, defaultTricksPerHand };
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return settings ? { ...DEFAULT_SETTINGS, ...settings } : { ...DEFAULT_SETTINGS, userId, updatedAt: 0 };
  },
});

export const save = mutation({
  args: {
    theme,
    cardBack,
    layout,
    showTrumpHints: v.boolean(),
    animations: v.boolean(),
    defaultPlayers: v.number(),
    defaultDecks: v.number(),
    defaultStartingTricksPerHand: v.optional(v.number()),
    defaultTricksPerHand: v.number(),
    defaultBotMood: botMood,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await ensureProfile(ctx, userId);
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const payload = {
      userId,
      theme: args.theme,
      cardBack: args.cardBack,
      layout: args.layout,
      showTrumpHints: args.showTrumpHints,
      animations: args.animations,
      ...sanitizeMatchDefaults(
        args.defaultPlayers,
        args.defaultDecks,
        args.defaultStartingTricksPerHand,
        args.defaultTricksPerHand,
      ),
      defaultBotMood: args.defaultBotMood,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { ...existing, ...payload };
    }
    const id = await ctx.db.insert("userSettings", payload);
    return await ctx.db.get(id);
  },
});
