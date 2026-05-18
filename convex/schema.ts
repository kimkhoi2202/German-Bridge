import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const profileFields = {
  userId: v.id("users"),
  username: v.string(),
  displayName: v.string(),
  avatarSeed: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

const settingsFields = {
  userId: v.id("users"),
  theme: v.union(v.literal("emerald"), v.literal("midnight"), v.literal("graphite")),
  cardBack: v.union(v.literal("classic"), v.literal("lattice"), v.literal("monogram")),
  layout: v.union(v.literal("salon"), v.literal("pad")),
  showTrumpHints: v.boolean(),
  animations: v.boolean(),
  defaultPlayers: v.number(),
  defaultDecks: v.number(),
  defaultStartingTricksPerHand: v.optional(v.number()),
  defaultTricksPerHand: v.number(),
  defaultBotMood: v.union(
    v.literal("cautious"),
    v.literal("mixed"),
    v.literal("aggressive"),
    v.literal("champion"),
    v.literal("gpt"),
  ),
  updatedAt: v.number(),
};

export default defineSchema({
  ...authTables,

  profiles: defineTable(profileFields)
    .index("by_userId", ["userId"])
    .index("by_username", ["username"]),

  userSettings: defineTable(settingsFields).index("by_userId", ["userId"]),

  games: defineTable({
    inviteCode: v.string(),
    creatorUserId: v.id("users"),
    status: v.union(
      v.literal("setup"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("abandoned"),
    ),
    playerCount: v.number(),
    decks: v.number(),
    startingTricksPerHand: v.optional(v.number()),
    tricksPerHand: v.number(),
    maxRounds: v.number(),
    defaultBotMood: v.optional(
      v.union(
        v.literal("cautious"),
        v.literal("mixed"),
        v.literal("aggressive"),
        v.literal("champion"),
        v.literal("gpt"),
      ),
    ),
    sequence: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    winnerSeatIdx: v.optional(v.number()),
    abandonedByUserId: v.optional(v.id("users")),
  })
    .index("by_inviteCode", ["inviteCode"])
    .index("by_creatorUserId_and_status", ["creatorUserId", "status"])
    .index("by_status", ["status"]),

  gameParticipants: defineTable({
    gameId: v.id("games"),
    seatIdx: v.number(),
    kind: v.union(v.literal("human"), v.literal("bot")),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    name: v.string(),
    personality: v.union(
      v.literal("cautious"),
      v.literal("mixed"),
      v.literal("aggressive"),
      v.literal("champion"),
      v.literal("gpt"),
    ),
    joinedAt: v.number(),
  })
    .index("by_gameId_and_seatIdx", ["gameId", "seatIdx"])
    .index("by_gameId", ["gameId"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_gameId", ["userId", "gameId"]),

  gameStates: defineTable({
    gameId: v.id("games"),
    state: v.any(),
    updatedAt: v.number(),
  }).index("by_gameId", ["gameId"]),

  gameEvents: defineTable({
    gameId: v.id("games"),
    sequence: v.number(),
    type: v.string(),
    actorUserId: v.optional(v.id("users")),
    seatIdx: v.optional(v.number()),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_gameId_and_sequence", ["gameId", "sequence"])
    .index("by_gameId", ["gameId"]),

  aiDecisionTraces: defineTable({
    gameId: v.id("games"),
    sequence: v.number(),
    seatIdx: v.number(),
    phase: v.union(v.literal("bidding"), v.literal("playing")),
    round: v.number(),
    trickIdx: v.number(),
    policyId: v.string(),
    requestedPolicyId: v.string(),
    personality: v.union(
      v.literal("cautious"),
      v.literal("mixed"),
      v.literal("aggressive"),
      v.literal("champion"),
      v.literal("gpt"),
    ),
    checkpointId: v.optional(v.string()),
    fallback: v.boolean(),
    fallbackReason: v.optional(v.string()),
    chosenAction: v.any(),
    legalActionCount: v.number(),
    legalActions: v.any(),
    topActions: v.any(),
    heuristic: v.optional(v.any()),
    observation: v.any(),
    createdAt: v.number(),
  })
    .index("by_gameId_and_sequence", ["gameId", "sequence"])
    .index("by_gameId", ["gameId"]),

  gamePresence: defineTable({
    gameId: v.id("games"),
    userId: v.id("users"),
    status: v.union(v.literal("online"), v.literal("offline")),
    lastSeenAt: v.number(),
  })
    .index("by_gameId_and_userId", ["gameId", "userId"])
    .index("by_gameId", ["gameId"])
    .index("by_userId", ["userId"]),

  userStats: defineTable({
    userId: v.id("users"),
    gamesPlayed: v.number(),
    gamesWon: v.number(),
    totalScore: v.number(),
    bestScore: v.number(),
    lastCompletedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
});
