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
    ],
  },
});
