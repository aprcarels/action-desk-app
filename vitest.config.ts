import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "server/**/*.test.ts",
      "electron/**/*.test.ts",
    ],
    exclude: ["dist/**", "node_modules/**", "temp-morning-briefing/**"],
  },
});
