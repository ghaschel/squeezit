import { defineConfig } from "vitest/config";

const isCi = Boolean(process.env.CI);

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    fileParallelism: true,
    maxWorkers: isCi ? 2 : 6,
    maxConcurrency: isCi ? 2 : 4,
    testTimeout: 1200_000,
    hookTimeout: 1200_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
