import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type WatchData = Awaited<ReturnType<ConvexClient["query"]>>;

type ProbeClient = {
  label: string;
  username: string;
  token: string;
  client: ConvexClient;
  latest: any;
  updates: Array<{ atMs: number; sequence: number; phase: string | null }>;
};

type ActionMetric = {
  label: string;
  sequence: number;
  actor: string;
  ackMs: number;
  allSubscribersMs: number;
  postAckFanoutMs: number;
  perClientMs: Record<string, number>;
  phase: string | null;
};

const ROOT = process.cwd();
const ENV = loadEnv(join(ROOT, ".env.local"));
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? ENV.NEXT_PUBLIC_CONVEX_URL;
const PASSWORD = "realtime-probe-password";
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    [
      "Usage: pnpm exec tsx scripts/realtime-six-player-probe.ts [options]",
      "",
      "Options:",
      "  --players <n>      Number of authenticated clients to create (default: 6)",
      "  --decks <n>        Deck count for the room (default: 1)",
      "  --tricks <n>       Tricks-per-hand ladder cap (default: 3)",
      "  --max-actions <n>  Maximum measured human mutations (default: 40)",
    ].join("\n"),
  );
  process.exit(0);
}

const PLAYER_COUNT = numberArg("--players", 6);
const DECKS = numberArg("--decks", 1);
const TRICKS = numberArg("--tricks", 3);
const MAX_ACTIONS = numberArg("--max-actions", 40);
const RUN_ID = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15).toLowerCase();

if (!CONVEX_URL) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL. Set it in .env.local or the shell.");
}

function loadEnv(path: string) {
  const values: Record<string, string> = {};
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // The caller may provide env directly.
  }
  return values;
}

function numberArg(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(label: string, fn: () => T | null | undefined | false, timeoutMs = 20_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const value = fn();
    if (value) return value;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function signUpOrIn(http: ConvexHttpClient, username: string) {
  async function sign(flow: "signUp" | "signIn") {
    return await http.action(api.auth.signIn as any, {
      provider: "password",
      params: {
        flow,
        username,
        email: username,
        password: PASSWORD,
      },
    });
  }

  try {
    return await sign("signUp");
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("already exists")) throw error;
    return await sign("signIn");
  }
}

function attachClient(label: string, username: string, token: string) {
  const client = new ConvexClient(CONVEX_URL);
  client.setAuth(async () => token);
  return {
    label,
    username,
    token,
    client,
    latest: null,
    updates: [],
  } satisfies ProbeClient;
}

async function waitForAuth(client: ProbeClient) {
  await waitFor(`${client.label} auth`, () => {
    const state = client.client.connectionState();
    return state.hasInflightRequests === false ? state : null;
  }, 10_000).catch(() => null);
}

function subscribeWatch(probe: ProbeClient, gameId: Id<"games">, origin: number) {
  return probe.client.onUpdate(
    api.games.watch as any,
    { gameId },
    (result: WatchData) => {
      const data = result as any;
      probe.latest = data;
      probe.updates.push({
        atMs: performance.now() - origin,
        sequence: data?.game?.sequence ?? -1,
        phase: data?.state?.phase ?? null,
      });
    },
    (error) => {
      throw error;
    },
  );
}

function activeClient(clients: ProbeClient[]) {
  return clients.find((probe) => {
    const state = probe.latest?.state;
    if (!state) return false;
    return (
      (state.phase === "bidding" && state.bidTurn === 0 && probe.latest.legalBids?.length) ||
      (state.phase === "playing" && state.turnIdx === 0 && probe.latest.legalCardKeys?.length) ||
      state.phase === "round-end"
    );
  });
}

async function waitForSequence(clients: ProbeClient[], sequence: number, startedAt: number) {
  const perClientMs: Record<string, number> = {};
  await waitFor(`all clients to observe sequence ${sequence}`, () => {
    for (const probe of clients) {
      if (perClientMs[probe.label] == null && (probe.latest?.game?.sequence ?? 0) >= sequence) {
        perClientMs[probe.label] = performance.now() - startedAt;
      }
    }
    return Object.keys(perClientMs).length === clients.length ? perClientMs : null;
  }, 20_000);
  return perClientMs;
}

async function measureAction(
  clients: ProbeClient[],
  actor: ProbeClient,
  label: string,
  mutate: () => Promise<any>,
) {
  const previousSequence = actor.latest?.game?.sequence ?? 0;
  const startedAt = performance.now();
  const response = await mutate();
  const ackMs = performance.now() - startedAt;
  const sequence =
    typeof response?.sequence === "number"
      ? (response.sequence as number)
      : await waitFor(`sequence after ${label}`, () => {
          const next = actor.latest?.game?.sequence;
          return typeof next === "number" && next > previousSequence ? next : null;
        });
  const perClientMs = await waitForSequence(clients, sequence, startedAt);
  const allSubscribersMs = Math.max(...Object.values(perClientMs));
  return {
    label,
    sequence,
    actor: actor.label,
    ackMs,
    allSubscribersMs,
    postAckFanoutMs: Math.max(0, allSubscribersMs - ackMs),
    perClientMs,
    phase: actor.latest?.state?.phase ?? null,
  } satisfies ActionMetric;
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

async function main() {
  const origin = performance.now();
  const http = new ConvexHttpClient(CONVEX_URL);
  const clients: ProbeClient[] = [];
  const users = Array.from({ length: PLAYER_COUNT }, (_, index) => ({
    label: `P${index + 1}`,
    username: `rt_${RUN_ID}_${index + 1}`,
  }));

  console.log(`Realtime probe target: ${CONVEX_URL}`);
  console.log(`Creating ${PLAYER_COUNT} authenticated clients...`);
  for (const user of users) {
    const auth = (await signUpOrIn(http, user.username)) as any;
    clients.push(attachClient(user.label, user.username, auth.tokens.token));
  }
  await Promise.all(clients.map(waitForAuth));

  const creator = clients[0];
  const created = (await creator.client.mutation(api.rooms.create as any, {
    playerCount: PLAYER_COUNT,
    decks: DECKS,
    tricksPerHand: TRICKS,
    botMood: "mixed",
  })) as { gameId: Id<"games">; inviteCode: string };

  for (const client of clients.slice(1)) {
    await client.client.mutation(api.rooms.joinByCode as any, { inviteCode: created.inviteCode });
  }

  const unsubs = clients.map((client) => subscribeWatch(client, created.gameId, origin));
  await waitFor("all watch subscriptions to load setup room", () =>
    clients.every((client) => client.latest?.participants?.length === PLAYER_COUNT) ? true : null,
  );

  const metrics: ActionMetric[] = [];
  metrics.push(
    await measureAction(clients, creator, "start_room", () =>
      creator.client.mutation(api.rooms.start as any, {
        gameId: created.gameId,
        botMood: "mixed",
      }),
    ),
  );

  await waitFor("bidding phase", () =>
    clients.every((client) => client.latest?.state?.phase === "bidding") ? true : null,
    15_000,
  );

  while (metrics.length < MAX_ACTIONS) {
    const actor = await waitFor("active human turn", () => activeClient(clients), 20_000);
    const state = actor.latest.state;
    if (state.phase === "bidding") {
      const legalBids = actor.latest.legalBids as number[];
      const bid = legalBids.includes(1) ? 1 : legalBids[0];
      metrics.push(
        await measureAction(clients, actor, `bid_${metrics.length}`, () =>
          actor.client.mutation(api.games.placeBid as any, {
            gameId: created.gameId,
            bid,
          }),
        ),
      );
      continue;
    }
    if (state.phase === "playing") {
      const cardKey = (actor.latest.legalCardKeys as string[])[0];
      metrics.push(
        await measureAction(clients, actor, `play_${metrics.length}`, () =>
          actor.client.mutation(api.games.playCard as any, {
            gameId: created.gameId,
            cardKey,
          }),
        ),
      );
      continue;
    }
    if (state.phase === "round-end") {
      metrics.push(
        await measureAction(clients, actor, `advance_round_${metrics.length}`, () =>
          actor.client.mutation(api.games.advanceRound as any, {
            gameId: created.gameId,
          }),
        ),
      );
      if (actor.latest?.state?.phase === "match-end") break;
      continue;
    }
    if (state.phase === "match-end") break;
  }

  for (const unsub of unsubs) unsub();
  await Promise.all(clients.map((client) => client.client.close()));

  const ack = metrics.map((metric) => metric.ackMs);
  const all = metrics.map((metric) => metric.allSubscribersMs);
  const fanout = metrics.map((metric) => metric.postAckFanoutMs);
  const report = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    target: {
      convexUrl: CONVEX_URL,
      playerCount: PLAYER_COUNT,
      decks: DECKS,
      tricksPerHand: TRICKS,
      note: "This measures direct Convex Cloud mutation roundtrips and WebSocket query propagation from six local clients.",
    },
    room: created,
    summary: {
      actionCount: metrics.length,
      ackMs: summarize(ack),
      allSubscribersMs: summarize(all),
      postAckFanoutMs: summarize(fanout),
    },
    metrics,
    updateCounts: Object.fromEntries(clients.map((client) => [client.label, client.updates.length])),
  };

  const outDir = join(ROOT, "reports", "realtime");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${RUN_ID}-six-player-probe.json`);
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report: ${outPath}`);
}

function summarize(values: number[]) {
  return {
    min: Math.min(...values),
    median: percentile(values, 50),
    p95: percentile(values, 95),
    max: Math.max(...values),
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
