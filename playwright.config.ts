import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

function isExternalBaseUrl(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1" &&
      parsed.hostname !== "::1"
    );
  } catch {
    return false;
  }
}

const isExternal = isExternalBaseUrl(process.env.PLAYWRIGHT_TEST_BASE_URL);
const includeProdSmoke =
  process.env.PLAYWRIGHT_INCLUDE_PROD_SMOKE === "1" ||
  process.argv.some((arg) => arg.includes("production-smoke"));

export default defineConfig({
  testDir: "./e2e",
  testIgnore: includeProdSmoke ? undefined : ["**/production-smoke.spec.ts"],
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: isExternal
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120000,
      },
  projects: [
    {
      name: "Mobile Chrome (375x812)",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});
