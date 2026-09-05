import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";

// Deliberately separate from the secret-free CI smoke suite. The caller starts
// the local Worker and Stripe CLI listener, and explicitly opts into sandbox I/O.
if (process.env.CI || process.env.BILLING_E2E !== "1") {
  throw new Error("Sandbox E2E requires BILLING_E2E=1 outside CI.");
}
loadEnvFile(process.env.BILLING_E2E_ENV_FILE ?? ".dev.vars.billing");

export default defineConfig({
  testDir: "./tests/billing-sandbox",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.BILLING_APP_URL,
    actionTimeout: 20_000,
    // Keep auth cookies and hosted payment payloads out of persisted traces.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "sandbox-chromium", use: { ...devices["Desktop Chrome"] } }],
});
