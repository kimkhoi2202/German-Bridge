import "@testing-library/jest-dom/vitest";

// Polyfill: install a real localStorage shim into the global scope so Zustand's
// persist middleware finds working storage no matter what happy-dom/jsdom does.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(i: number) {
    return [...this.store.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

const ls = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: ls, writable: true, configurable: true });
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", { value: ls, writable: true, configurable: true });
}
