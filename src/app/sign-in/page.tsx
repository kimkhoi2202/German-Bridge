"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";

type Mode = "signIn" | "signUp";

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function getRedirectPath() {
  if (typeof window === "undefined") return "/";
  const redirect = new URLSearchParams(window.location.search).get("redirect") ?? "/";
  if (!redirect.startsWith("/") || redirect.startsWith("//") || redirect.startsWith("/sign-in")) {
    return "/";
  }
  return redirect;
}

function authErrorMessage(err: unknown, mode: Mode, username: string) {
  const rawMessage = err instanceof Error ? err.message : "";
  const message = rawMessage.toLowerCase();

  if (mode === "signUp" && message.includes("already exists")) {
    return `An account named ${username} already exists. I switched you to Sign in.`;
  }
  if (message.includes("invalid password") || message.includes("invalid credentials")) {
    return "That username and password did not match.";
  }
  if (message.includes("password must be")) {
    return "Password must be 8-128 characters.";
  }
  if (message.includes("username")) {
    return "Username must be 3-20 lowercase letters, numbers, or underscores.";
  }
  return mode === "signIn" ? "Could not sign in with those credentials." : "Could not create that account.";
}

export default function SignInPage() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [mode, setMode] = useState<Mode>("signIn");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (!isLoading && isAuthenticated) router.replace(getRedirectPath());
  }, [isAuthenticated, isLoading, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const cleanUsername = normalizeUsername(username);
    try {
      await signIn("password", {
        flow: mode,
        username: cleanUsername,
        email: cleanUsername,
        password,
      });
      router.replace(getRedirectPath());
    } catch (err) {
      if (mode === "signUp" && err instanceof Error && err.message.toLowerCase().includes("already exists")) {
        setMode("signIn");
      }
      setError(authErrorMessage(err, mode, cleanUsername));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="gb-lobby gb-auth-page">
      <form className="gb-lobby-card gb-auth-card fade-in" onSubmit={onSubmit}>
        <div className="gb-lobby-header">
          <div className="gb-wordmark-rule" aria-hidden="true" />
          <h1 className="gb-lobby-h1" aria-label="German Bridge">
            <span>German</span>
            <span>Bridge</span>
          </h1>
        </div>

        <div className="gb-auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signIn"}
            className={mode === "signIn" ? "on" : ""}
            onClick={() => setMode("signIn")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signUp"}
            className={mode === "signUp" ? "on" : ""}
            onClick={() => setMode("signUp")}
          >
            Create account
          </button>
        </div>

        <label className="gb-auth-field">
          <span className="eyebrow">Username</span>
          <input
            className="gb-settings-input"
            value={username}
            onChange={(event) => setUsername(normalizeUsername(event.target.value))}
            autoComplete="username"
            spellCheck={false}
            pattern="[a-z0-9_]{3,20}"
            minLength={3}
            maxLength={20}
            required
          />
        </label>

        <label className="gb-auth-field">
          <span className="eyebrow">Password</span>
          <input
            className="gb-settings-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            minLength={8}
            maxLength={128}
            required
          />
        </label>

        {error && <div className="gb-auth-error">{error}</div>}

        <Button type="submit" className="gb-auth-submit" isDisabled={!hydrated || submitting || isLoading}>
          {mode === "signIn" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
