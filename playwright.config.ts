import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3100", browserName: "chromium", channel: process.env.PLAYWRIGHT_CHANNEL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: { AWS_REGION: "", AWS_DEFAULT_REGION: "", ADAPT_PDF_SPIKE: "1", ADAPT_AI_DISABLE: "1" },
  },
});
