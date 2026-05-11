import { describe, it, expect } from "vitest";

describe("env", () => {
  it("has working localStorage via global", () => {
    expect(typeof localStorage).toBe("object");
    expect(typeof localStorage.setItem).toBe("function");
    localStorage.setItem("k", "v");
    expect(localStorage.getItem("k")).toBe("v");
    localStorage.removeItem("k");
  });
});
