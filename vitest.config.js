import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/agent.js"], // interactive REPL entry point
    },
  },
});
