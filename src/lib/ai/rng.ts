export interface SeededRng {
  readonly seed: string;
  next: () => number;
  int: (maxExclusive: number) => number;
  pick: <T>(items: readonly T[]) => T;
  fork: (label: string | number) => SeededRng;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRng(seed: string | number): SeededRng {
  const normalized = String(seed);
  let state = hashSeed(normalized) || 0x9e3779b9;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };

  return {
    seed: normalized,
    next,
    int(maxExclusive) {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error(`rng.int: maxExclusive must be a positive integer, got ${maxExclusive}`);
      }
      return Math.floor(next() * maxExclusive);
    },
    pick(items) {
      if (items.length === 0) throw new Error("rng.pick: empty array");
      return items[this.int(items.length)];
    },
    fork(label) {
      return createSeededRng(`${normalized}:${label}`);
    },
  };
}

export function shuffleWithRng<T>(items: readonly T[], rng: SeededRng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
