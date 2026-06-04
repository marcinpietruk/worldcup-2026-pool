import { defineConfig } from "@playwright/test";

// E2E against the dev server. Uses the system Google Chrome (channel: "chrome")
// so there's no separate browser download. Reuses a running dev server if present.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/api/state",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
