import { defineConfig } from "playwright/test";

const mode = process.env.BROWSER_TEST_MODE ?? "preview";
if (mode !== "preview" && mode !== "approved") throw new Error("Unexpected test mode");
const baseURL = "http://localhost:3172";

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: `.next/browser-results/${mode}`,
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    launchOptions: { executablePath: process.env.BROWSER_TEST_CHROMIUM }
  },
  webServer: {
    command: "node scripts/test-browser-server.mjs",
    env: { BROWSER_TEST_MODE: mode },
    url: baseURL + "/login",
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 }
  }
});
