import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "admin",
      testMatch: /admin\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/admin.json" },
      dependencies: ["setup"],
    },
    {
      name: "professional",
      testMatch: /professional\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/professional.json" },
      dependencies: ["setup"],
    },
    {
      name: "client",
      testMatch: /client\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/client.json" },
      dependencies: ["setup"],
    },
    {
      name: "rbac",
      testMatch: /rbac\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
