import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureProfile, getProfile, requireUserId } from "./lib/users";

const DISPLAY_NAME_MAX = 24;

function cleanDisplayName(value: string) {
  return (
    value
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, DISPLAY_NAME_MAX) || "Player"
  );
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    const user = await ctx.db.get(userId);
    if (profile) return profile;
    const username = (user?.email ?? user?.name ?? "player").toLowerCase();
    return {
      _id: null,
      _creationTime: Date.now(),
      userId,
      username,
      displayName: user?.name ?? username,
      avatarSeed: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },
});

export const update = mutation({
  args: {
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await ensureProfile(ctx, userId);
    const displayName = cleanDisplayName(args.displayName);
    await ctx.db.patch(profile._id, {
      displayName,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(userId, { name: displayName });
    return { ...profile, displayName };
  },
});
