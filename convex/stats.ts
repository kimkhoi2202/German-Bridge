import { query } from "./_generated/server";
import { requireUserId } from "./lib/users";

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const stats = await ctx.db
      .query("userStats")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return (
      stats ?? {
        userId,
        gamesPlayed: 0,
        gamesWon: 0,
        totalScore: 0,
        bestScore: 0,
        updatedAt: 0,
      }
    );
  },
});
