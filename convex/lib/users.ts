import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export type AuthCtx = QueryCtx | MutationCtx;

export async function requireUserId(ctx: AuthCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Authentication required");
  return userId;
}

function usernameFromUser(user: Doc<"users"> | null) {
  const raw = user?.email ?? user?.name ?? "player";
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20) || "player";
}

function seedFromUserId(userId: Id<"users">) {
  return Array.from(userId).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 1_000_000, 7);
}

export async function ensureProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles">> {
  const existing = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (existing) return existing;

  const user = await ctx.db.get(userId);
  const username = usernameFromUser(user);
  const now = Date.now();
  const profileId = await ctx.db.insert("profiles", {
    userId,
    username,
    displayName: user?.name ?? username,
    avatarSeed: seedFromUserId(userId),
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(profileId))!;
}

export async function getProfile(ctx: AuthCtx, userId: Id<"users">) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}
