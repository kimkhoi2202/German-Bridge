import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { Value } from "convex/values";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function usernameFromParams(params: Record<string, Value | undefined>) {
  const raw = params.username ?? params.email;
  if (typeof raw !== "string") throw new Error("Username is required");
  const username = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new Error("Username must be 3-20 lowercase letters, numbers, or underscores");
  }
  return username;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const username = usernameFromParams(params);
        return {
          email: username,
          name: username,
        };
      },
      validatePasswordRequirements(password) {
        if (password.length < 8 || password.length > 128) {
          throw new Error("Password must be 8-128 characters");
        }
      },
    }),
  ],
});
