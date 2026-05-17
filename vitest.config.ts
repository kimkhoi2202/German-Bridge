import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    environmentMatchGlobs: [["convex/**/*.test.ts", "edge-runtime"]],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "convex/**/*.test.ts"],
    testTimeout: 180_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
