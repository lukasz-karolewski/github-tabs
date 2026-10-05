import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Faster startup for this pure JavaScript suite; retain file isolation.
    pool: "threads",
  },
});
