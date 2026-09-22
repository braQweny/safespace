import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/lib/**/__tests__/**/*.test.ts",
      "src/components/**/__tests__/**/*.test.{ts,tsx}",
      "src/pages/**/__tests__/**/*.test.ts",
      "src/__tests__/**/*.test.ts",
    ],
    // `npm run test:coverage` — a report, not a gate: it shows which parts of
    // the privacy and billing boundaries no test reaches.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/__tests__/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "html"],
    },
  },
});
